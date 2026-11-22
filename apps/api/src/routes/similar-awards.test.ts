import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, EMPTY_TIMELINE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import type { GovSpendingCooldownStore } from '../repositories/govspending-cooldown.repository';
import { E_BIDDING_METHOD } from '../services/egp/constants';
import type { SimilarAwardsClient } from '../services/similar-awards.service';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryUserStore } from '../testing/user-store';

// Fixtures only, with invented names. The open-data client is a fake: no request leaves the process.

const AGENCY = 'หน่วยงานตัวอย่าง';
const NAME =
  'ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์เพื่อการป้องกันภัยตัวอย่าง ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)';

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: 'sim-tor',
    projectName: NAME,
    deptName: AGENCY,
    deptSubName: null,
    deptCode: '1234567890',
    budgetYear: 2569,
    typeId: null,
    goodsId: null,
    detailReadAt: '2026-09-01T00:00:00.000Z',
    announceDate: '2026-06-01T00:00:00.000Z',
    purchaseMethodName: E_BIDDING_METHOD,
    projectMoney: 1_000_000,
    priceBuild: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    analysis: null,
    discoveredAt: '2026-09-16T00:00:00.000Z',
    timeline: { ...EMPTY_TIMELINE, status: 'open' },
    approved: null,
    archive: { zipId: 'zip-1', documents: [], torAmbiguous: false },
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('POST /api/tors/:projectId/similar-awards', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let procurements: InMemoryProcurementStore;
  let searches: { keyword: string; year: number }[];
  let lookups: { projectId: string; year: number }[];
  let cooldownUntil: string | null;

  const client: SimilarAwardsClient = {
    search: async (keyword, year) => {
      searches.push({ keyword, year });
      return {
        rows:
          year === 2569
            ? [
                {
                  project_id: 'earlier-1',
                  project_name:
                    'ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์เพื่อการป้องกันภัยตัวอย่าง',
                  dept_name: AGENCY,
                  purchase_method_name: E_BIDDING_METHOD,
                  announce_date: '1 ต.ค. 68',
                  project_money: 1_000_000,
                  contract: [
                    { contract_no: 'CN-1', winner_name: 'บริษัท เอ จำกัด', price_agree: 950_000 },
                  ],
                },
              ]
            : [],
        total: year === 2569 ? 1 : 0,
        truncated: false,
        quota: { limitDay: 1000, remainingDay: 900 },
      };
    },
    submissions: async (projectId, year) => {
      lookups.push({ projectId, year });
      return {
        rows: [
          {
            seq_no: 1,
            seq_no_desc: 'รายการที่ 1',
            bidder: [
              { merchant_name: 'บริษัท เอ จำกัด', submit_price: '960000.00' },
              { merchant_name: 'บริษัท บี จำกัด', submit_price: '970000.00' },
            ],
          },
        ],
        truncated: false,
      };
    },
  };

  const cooldown: GovSpendingCooldownStore = {
    getCooldownUntil: async () => cooldownUntil,
    extendCooldown: async (until) => {
      cooldownUntil = until;
    },
  };

  beforeEach(async () => {
    searches = [];
    lookups = [];
    cooldownUntil = null;
    procurements = new InMemoryProcurementStore();
    await procurements.upsert(procurement());
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      procurements,
      users: new InMemoryUserStore(),
      govSpendingCooldown: cooldown,
      similarAwardsClient: client,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const session = (role: User['role'] = 'business_development_officer') => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: 'user-1', username: 'tester', role }),
  });
  const post = (projectId: string, role?: User['role']) =>
    app.inject({
      method: 'POST',
      url: `/api/tors/${projectId}/similar-awards`,
      cookies: session(role),
    });

  test('rejects an anonymous caller without asking open data', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/tors/sim-tor/similar-awards' });

    expect(response.statusCode).toBe(401);
    expect(searches).toHaveLength(0);
  });

  test('is a POST only: a GET (a link, a prefetch, a crawler) never asks open data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/sim-tor/similar-awards',
      cookies: session(),
    });

    expect(response.statusCode).toBe(404);
    expect(searches).toHaveLength(0);
  });

  test('returns the search, the listed past awards and the bidders, and is never cached by the browser', async () => {
    const response = await post('sim-tor');

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const body = response.json<{
      status: string;
      keyword: string;
      searches: unknown[];
      listed: {
        projectId: string;
        prices: { agreedPrice: number } | null;
        bidderCount: number;
        winners: { name: string }[];
      }[];
      competition: { level: string | null; withKnownBidderCount: number };
      cached: boolean;
    }>();
    expect(body.status).toBe('ok');
    expect(body.keyword).toBe('บำรุงรักษาระบบสารสนเทศภูมิศาสตร์เพื่อการป้องกันภัยตัวอย่าง');
    expect(body.searches).toHaveLength(3);
    expect(body.listed).toHaveLength(1);
    expect(body.listed[0]).toMatchObject({
      projectId: 'earlier-1',
      bidderCount: 2,
      winners: [{ name: 'บริษัท เอ จำกัด' }],
      prices: { agreedPrice: 950_000 },
    });
    // One project is far below the five a level needs.
    expect(body.competition).toMatchObject({ level: null, withKnownBidderCount: 1 });
    expect(searches).toHaveLength(3);
    expect(lookups).toEqual([{ projectId: 'earlier-1', year: 2569 }]);
  });

  test('asking again costs no further call', async () => {
    await post('sim-tor');
    const second = await post('sim-tor');

    expect(second.json<{ cached: boolean }>().cached).toBe(true);
    expect(searches).toHaveLength(3);
    expect(lookups).toHaveLength(1);
  });

  test('is the same for an administrator and an officer', async () => {
    const officer = (await post('sim-tor', 'business_development_officer')).json<{
      cached: boolean;
    }>();
    const admin = (await post('sim-tor', 'admin')).json<{ cached: boolean }>();

    expect({ ...admin, cached: false }).toEqual({ ...officer, cached: false });
  });

  test('is 404 for an unknown project and for one the caller may not open', async () => {
    await procurements.upsert(
      procurement({ projectId: 'sim-held', outcome: 'needs_review', holdReason: 'partial_read' }),
    );

    expect((await post('missing')).statusCode).toBe(404);
    expect((await post('sim-held')).statusCode).toBe(404);
    expect(searches).toHaveLength(0);
  });

  test('an administrator opening a held TOR is told it is not offered, and nothing is asked', async () => {
    await procurements.upsert(
      procurement({ projectId: 'sim-held', outcome: 'needs_review', holdReason: 'partial_read' }),
    );

    const response = await post('sim-held', 'admin');

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string; listed: unknown[] }>()).toMatchObject({
      status: 'not_offered',
      listed: [],
    });
    expect(searches).toHaveLength(0);
  });

  test('a name with no keyword asks nothing', async () => {
    await procurements.upsert(
      procurement({
        projectId: 'sim-short',
        projectName: 'ประกวดราคาซื้อรถยนต์ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      }),
    );

    const response = await post('sim-short');

    expect(response.json<{ status: string; keywordSkipped: string }>()).toMatchObject({
      status: 'no_keyword',
      keywordSkipped: 'too_short',
    });
    expect(searches).toHaveLength(0);
  });

  test('during the cooldown nothing is asked, and it is said so', async () => {
    cooldownUntil = '2099-01-01T00:00:00.000Z';

    const response = await post('sim-tor');

    expect(response.json<{ status: string; cooldownUntil: string }>()).toMatchObject({
      status: 'cooling_down',
      cooldownUntil: '2099-01-01T00:00:00.000Z',
    });
    expect(searches).toHaveLength(0);
  });

  test('the response carries no winning price and no api key', async () => {
    const text = (await post('sim-tor')).body;

    expect(text).not.toMatch(/winningPrice|winning_price/);
    expect(text).not.toContain('api-key');
    expect(text).not.toContain(testEnv({}).EGP_API_KEY);
  });
});
