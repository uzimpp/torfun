import { describe, expect, test } from 'bun:test';
import {
  EMPTY_TIMELINE,
  SIMILAR_AWARDS_MAX_BIDDER_CALLS,
  SIMILAR_AWARDS_MAX_SEARCHES,
  type Procurement,
} from '@torfun/types';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';
import { NotFoundError } from '../core/errors';
import type { GovSpendingCooldownStore } from '../repositories/govspending-cooldown.repository';
import { RateLimitedError, UpstreamError } from './egp/client';
import type {
  EGPContractRecord,
  EGPContractSubmitRecord,
  KeywordSearchResult,
} from './egp/contract-client';
import { E_BIDDING_METHOD } from './egp/constants';
import {
  SIMILAR_AWARDS_CACHE_MS,
  SimilarAwardsService,
  similarAwardsYears,
  type SimilarAwardsClient,
} from './similar-awards.service';

// Fixtures only, with invented names. Nothing here reaches the network: the open-data calls
// are a fake client, and the cooldown is an object in memory.

const env = { EGP_API_KEY: 'test-api-key' } as Env;
const AGENCY = 'หน่วยงานตัวอย่าง';
const NAME = `ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์เพื่อการป้องกันภัยตัวอย่าง ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)`;
const KEYWORD = 'บำรุงรักษาระบบสารสนเทศภูมิศาสตร์เพื่อการป้องกันภัยตัวอย่าง';
const NOW = new Date('2026-11-22T03:00:00.000Z');
// 2026-11-22 is in Thai fiscal year 2570, so the years searched are 2568, 2569, 2570.
const YEARS = [2568, 2569, 2570];

const noLogger = {
  warn: () => {},
  info: () => {},
  error: () => {},
  debug: () => {},
} as unknown as FastifyBaseLogger;

function tor(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: 'tor-1',
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

const A = 'บริษัท เอ จำกัด';
const B = 'บริษัท บี จำกัด';
const C = 'บริษัท ซี จำกัด';

function row(id: string, overrides: Partial<EGPContractRecord> = {}): EGPContractRecord {
  return {
    project_id: id,
    project_name: `ประกวดราคาจ้างบำรุงรักษาระบบสารสนเทศภูมิศาสตร์เพื่อการป้องกันภัยตัวอย่าง รหัส ${id}`,
    dept_name: AGENCY,
    purchase_method_name: E_BIDDING_METHOD,
    announce_date: '1 ต.ค. 68',
    project_money: 1_000_000,
    price_build: 990_000,
    sum_price_agree: 950_000,
    contract: [{ contract_no: `CN-${id}`, winner_name: A, price_agree: 950_000 }],
    ...overrides,
  };
}

const bidders = (...names: string[]): EGPContractSubmitRecord[] => [
  {
    seq_no: 1,
    seq_no_desc: 'รายการที่ 1',
    bidder: names.map((name, index) => ({
      merchant_name: name,
      submit_price: `${900_000 + index}.00`,
    })),
  },
];

interface Calls {
  searches: { keyword: string; year: number }[];
  submissions: { projectId: string; year: number }[];
}

/** A fake open-data client: `rowsByYear` answers the searches, `bidderRows` the bidder lookups. */
function fakeClient(options: {
  rowsByYear?: Record<number, EGPContractRecord[]>;
  bidderRows?: (projectId: string, year: number) => EGPContractSubmitRecord[];
  total?: (year: number, rows: EGPContractRecord[]) => number;
  failSearch?: (year: number) => unknown;
  failSubmissions?: (projectId: string, year: number) => unknown;
  truncated?: (projectId: string, year: number) => boolean;
  remainingAfterSearch?: (year: number) => number | null;
}) {
  const calls: Calls = { searches: [], submissions: [] };
  const client: SimilarAwardsClient = {
    search: async (keyword, year, _env, quota) => {
      calls.searches.push({ keyword, year });
      const failure = options.failSearch?.(year);
      if (failure) throw failure;
      const rows = options.rowsByYear?.[year] ?? [];
      const remaining = options.remainingAfterSearch?.(year) ?? null;
      if (remaining !== null) quota.observe({ limitDay: 1000, remainingDay: remaining });
      return {
        rows,
        total: options.total?.(year, rows) ?? rows.length,
        truncated: false,
        quota: { limitDay: 1000, remainingDay: remaining },
      } satisfies KeywordSearchResult;
    },
    submissions: async (projectId, year) => {
      calls.submissions.push({ projectId, year });
      const failure = options.failSubmissions?.(projectId, year);
      if (failure) throw failure;
      return {
        rows: options.bidderRows?.(projectId, year) ?? [],
        truncated: options.truncated?.(projectId, year) ?? false,
      };
    },
  };
  return { client, calls };
}

function build(
  client: SimilarAwardsClient,
  options: {
    tor?: Procurement;
    cooldownUntil?: string | null;
    now?: () => Date;
  } = {},
) {
  const cooldown = { until: options.cooldownUntil ?? null };
  const cooldownStore: GovSpendingCooldownStore = {
    getCooldownUntil: async () => cooldown.until,
    extendCooldown: async (until) => {
      if (cooldown.until === null || until > cooldown.until) cooldown.until = until;
    },
  };
  const pauses: number[] = [];
  const tors = { get: async () => options.tor ?? tor() };
  const service = new SimilarAwardsService(tors, env, cooldownStore, noLogger, {
    client,
    now: options.now ?? (() => NOW),
    pause: async (ms) => {
      pauses.push(ms);
    },
  });
  return { service, cooldown, pauses, tors };
}

describe('similarAwardsYears', () => {
  test('is the current Thai fiscal year and the two before it, oldest first', () => {
    expect(similarAwardsYears(NOW)).toEqual(YEARS);
    // 30 September is still FY2569, 1 October starts FY2570.
    expect(similarAwardsYears(new Date('2026-09-29T20:00:00.000Z'))).toEqual([2567, 2568, 2569]);
    expect(similarAwardsYears(new Date('2026-09-30T18:00:00.000Z'))).toEqual([2568, 2569, 2570]);
  });

  test('is never more than the search limit', () => {
    expect(similarAwardsYears(NOW)).toHaveLength(SIMILAR_AWARDS_MAX_SEARCHES);
  });
});

describe('SimilarAwardsService: when nothing is asked', () => {
  test('a name with no keyword asks nothing and says why', async () => {
    const { client, calls } = fakeClient({});
    const { service } = build(client, {
      tor: tor({
        projectName:
          'ประกวดราคาซื้อครุภัณฑ์คอมพิวเตอร์ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      }),
    });

    const result = await service.find('tor-1', 'officer');

    expect(result).toMatchObject({
      status: 'no_keyword',
      keyword: null,
      keywordSkipped: 'too_generic',
    });
    expect(result.listed).toEqual([]);
    expect(calls.searches).toHaveLength(0);
  });

  test('a TOR an officer may not see is not offered, even to an administrator', async () => {
    const { client, calls } = fakeClient({});
    const { service } = build(client, {
      tor: tor({ outcome: 'needs_review', holdReason: 'partial_read' }),
    });

    expect((await service.find('tor-1', 'admin')).status).toBe('not_offered');
    expect(calls.searches).toHaveLength(0);
  });

  test('a removed TOR is not offered', async () => {
    const { client, calls } = fakeClient({});
    const removed = tor({
      publicationRemoval: { at: '2026-10-01T00:00:00.000Z', by: null, reportId: null },
    });
    const { service } = build(client, { tor: removed });

    expect((await service.find('tor-1', 'admin')).status).toBe('not_offered');
    expect(calls.searches).toHaveLength(0);
  });

  test('a TOR the caller may not open is the error `get` raises, not an empty result', async () => {
    const { client } = fakeClient({});
    const { service, tors } = build(client);
    tors.get = async () => {
      throw new NotFoundError('No ingested project tor-1');
    };

    await expect(service.find('tor-1', 'officer')).rejects.toBeInstanceOf(NotFoundError);
  });

  test('while the open-data cooldown lasts nothing is asked', async () => {
    const { client, calls } = fakeClient({ rowsByYear: { 2569: [row('p1')] } });
    const until = '2026-11-23T00:00:00.000Z';
    const { service } = build(client, { cooldownUntil: until });

    const result = await service.find('tor-1', 'officer');

    expect(result).toMatchObject({
      status: 'cooling_down',
      cooldownUntil: until,
      keyword: KEYWORD,
      complete: false,
    });
    expect(calls.searches).toHaveLength(0);
    expect(calls.submissions).toHaveLength(0);
  });

  test('a cooldown that has ended asks again', async () => {
    const { client, calls } = fakeClient({});
    const { service } = build(client, { cooldownUntil: '2026-11-21T00:00:00.000Z' });

    expect((await service.find('tor-1', 'officer')).status).toBe('ok');
    expect(calls.searches.length).toBeGreaterThan(0);
  });
});

describe('SimilarAwardsService: the searches', () => {
  test('makes at most three searches, one per year, with the generated keyword', async () => {
    const { client, calls } = fakeClient({});
    const { service, pauses } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(calls.searches).toEqual(YEARS.map((year) => ({ keyword: KEYWORD, year })));
    expect(calls.searches.length).toBeLessThanOrEqual(SIMILAR_AWARDS_MAX_SEARCHES);
    expect(result.searches.map((search) => search.year)).toEqual(YEARS);
    expect(result.keyword).toBe(KEYWORD);
    // A pause (the politeness delay) before every request after the first.
    expect(pauses).toHaveLength(2);
  });

  test('says what each search read and when more matched than was read', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2568: [row('p1')], 2569: [row('p2')], 2570: [] },
      total: (year, rows) => (year === 2569 ? rows.length + 40 : rows.length),
    });
    const { service } = build(client);

    const { searches } = await service.find('tor-1', 'officer');

    expect(
      searches.map((search) => [search.year, search.read, search.total, search.outcome]),
    ).toEqual([
      [2568, 1, 1, 'read'],
      [2569, 1, 41, 'read'],
      [2570, 0, 0, 'read'],
    ]);
  });

  test('a search with nothing found is a complete, empty result', async () => {
    const { client } = fakeClient({});
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result).toMatchObject({
      status: 'ok',
      rowsRead: 0,
      projects: 0,
      listed: [],
      competition: null,
      complete: true,
    });
    expect(result.bidderCalls).toEqual({ used: 0, max: SIMILAR_AWARDS_MAX_BIDDER_CALLS });
  });
});

describe('SimilarAwardsService: the filters only cut unrelated rows', () => {
  test('each exclusion is counted, and only a row that passes them all is listed', async () => {
    const good = row('good');
    const { client } = fakeClient({
      rowsByYear: {
        2569: [
          good,
          row('tor-1'),
          row('other-agency', { dept_name: 'หน่วยงานอื่น' }),
          row('not-e-bidding', { purchase_method_name: 'เฉพาะเจาะจง' }),
          row('no-contract', { contract: [] }),
          row('later', { announce_date: '1 ก.ค. 69' }),
          row('undated', { announce_date: '-' }),
          row('also-undated', { announce_date: undefined }),
          { ...row('malformed'), contract: undefined as unknown as EGPContractRecord['contract'] },
          { ...row('x'), project_id: '' },
          good,
        ],
      },
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.excluded).toEqual({
      ownProject: 1,
      otherAgency: 1,
      notEBidding: 1,
      noContractLines: 1,
      torUndated: 0,
      undated: 2,
      notEarlier: 1,
      malformed: 2,
      duplicates: 1,
    });
    expect(result.rowsRead).toBe(11);
    expect(result.listed.map((item) => item.projectId)).toEqual(['good']);
  });

  test('the same agency and e-bidding do not make a result similar: they are listed as found by name', async () => {
    // A row that is the same agency, e-bidding and earlier but plainly another job still passes:
    // the filters cannot tell, and the response carries nothing that says it is the same work.
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1', { project_name: 'ประกวดราคาซื้อรถบรรทุกขยะตัวอย่าง' })] },
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.listed.map((item) => item.projectId)).toEqual(['p1']);
    expect(Object.keys(result.listed[0]!)).not.toContain('similarity');
    expect(Object.keys(result.listed[0]!)).not.toContain('isSoftware');
  });

  test('an agency is compared exactly, with no trimming or case folding', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1', { dept_name: `${AGENCY} ` }), row('p2')] },
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.excluded.otherAgency).toBe(1);
    expect(result.listed.map((item) => item.projectId)).toEqual(['p2']);
  });

  test('"earlier" is strictly before: the same day as the TOR is not earlier', async () => {
    const { client } = fakeClient({
      rowsByYear: {
        2569: [
          row('same-day', { announce_date: '1 มิ.ย. 69' }),
          row('day-before', { announce_date: '31 พ.ค. 69' }),
        ],
      },
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.excluded.notEarlier).toBe(1);
    expect(result.listed.map((item) => item.projectId)).toEqual(['day-before']);
  });

  test('a TOR with no announcement date has nothing earlier, so nothing is listed', async () => {
    const { client, calls } = fakeClient({ rowsByYear: { 2569: [row('p1')] } });
    const { service } = build(client, { tor: tor({ announceDate: null }) });

    const result = await service.find('tor-1', 'officer');

    expect(result.excluded.torUndated).toBe(1);
    expect(result.listed).toEqual([]);
    expect(calls.submissions).toHaveLength(0);
  });
});

describe('SimilarAwardsService: winners that appear again', () => {
  const won = (id: string, name: string) =>
    row(id, { contract: [{ contract_no: `CN-${id}`, winner_name: name, price_agree: 950_000 }] });

  test('names a winner of two or more listed awards, counted out of those with a winner', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [won('p1', A), won('p2', A), won('p3', B)] },
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.repeatWinners).toEqual({ projects: 3, winners: [{ name: A, wins: 2 }] });
  });

  test('is null where no name repeats', async () => {
    const { client } = fakeClient({ rowsByYear: { 2569: [won('p1', A), won('p2', B)] } });
    const { service } = build(client);

    expect((await service.find('tor-1', 'officer')).repeatWinners).toBeNull();
  });
});

describe('SimilarAwardsService: the listing', () => {
  test('lists the ten nearest in planned budget, nearest first, with the full count', async () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row(`p${String(index + 1).padStart(2, '0')}`, {
        project_money: 1_000_000 + (index + 1) * 10_000,
      }),
    );
    const { client } = fakeClient({ rowsByYear: { 2569: rows } });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.projects).toBe(12);
    expect(result.closestCount).toBe(12);
    expect(result.listed).toHaveLength(10);
    expect(result.listed.map((item) => item.projectId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `p${String(index + 1).padStart(2, '0')}`),
    );
    expect(result.listed.map((item) => item.difference)).toEqual(
      Array.from({ length: 10 }, (_, index) => (index + 1) * 10_000),
    );
  });

  test('a project with no planned budget is left out and counted; a TOR with none lists nothing', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1'), row('p2', { project_money: undefined })] },
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');
    expect(result.withoutBudget).toBe(1);
    expect(result.listed.map((item) => item.projectId)).toEqual(['p1']);

    const bare = fakeClient({ rowsByYear: { 2569: [row('p1')] } });
    const none = await build(bare.client, { tor: tor({ projectMoney: null }) }).service.find(
      'tor-1',
      'officer',
    );
    expect(none.listed).toEqual([]);
    expect(none.ownBudget).toBeNull();
    expect(bare.calls.submissions).toHaveLength(0);
  });

  test('a project found in two years is one project, with the lines of both years', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: {
        2568: [
          row('p1', { contract: [{ contract_no: 'CN-1', winner_name: A, price_agree: 940_000 }] }),
        ],
        2569: [
          row('p1', { contract: [{ contract_no: 'CN-2', winner_name: A, price_agree: 950_000 }] }),
        ],
      },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.projects).toBe(1);
    expect(result.listed).toHaveLength(1);
    expect(result.listed[0]!.contractYears).toEqual([2568, 2569]);
    // One lookup for each of its years, newest first.
    expect(calls.submissions).toEqual([
      { projectId: 'p1', year: 2569 },
      { projectId: 'p1', year: 2568 },
    ]);
  });

  test('no budget year is claimed: the contract year is not a budget year', async () => {
    const { client } = fakeClient({ rowsByYear: { 2569: [row('p1')] } });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(Object.keys(result.listed[0]!)).not.toContain('budgetYear');
    expect(result.listed[0]!.contractYears).toEqual([2569]);
  });
});

describe('SimilarAwardsService: winners, prices and bidders', () => {
  test('a clean award shows the agreed contract price against the planned budget, never a winning price', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1')] },
      bidderRows: () => bidders(A, B, C),
    });
    const { service } = build(client);

    const [item] = (await service.find('tor-1', 'officer')).listed;

    expect(item).toMatchObject({
      projectId: 'p1',
      winnerStatus: 'resolved',
      winners: [{ name: A, jointVenture: false }],
      bidderCount: 3,
      clean: true,
      bidders: 'read',
    });
    expect(item!.prices).toMatchObject({
      agreedPrice: 950_000,
      agreedToBudget: 0.95,
      exceedsBudget: false,
    });
    expect(JSON.stringify(item)).not.toMatch(/winningPrice|winning_price/);
  });

  test('an agreed price above the planned budget is shown as it is', async () => {
    const { client } = fakeClient({
      rowsByYear: {
        2569: [
          row('p1', { contract: [{ contract_no: 'C', winner_name: A, price_agree: 1_200_000 }] }),
        ],
      },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const [item] = (await service.find('tor-1', 'officer')).listed;

    expect(item!.prices).toMatchObject({ agreedToBudget: 1.2, exceedsBudget: true });
  });

  test('where nothing is returned for the bidders, the count is unknown, never 0 or 1', async () => {
    const { client } = fakeClient({ rowsByYear: { 2569: [row('p1')] }, bidderRows: () => [] });
    const { service } = build(client);

    const [item] = (await service.find('tor-1', 'officer')).listed;

    expect(item).toMatchObject({
      bidders: 'none',
      bidderCount: null,
      bidderCountGap: 'no_bids',
      clean: false,
    });
  });

  test('a cut page of bidders is not used: the count is unknown and the lookup is failed', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1')] },
      bidderRows: () => bidders(A, B),
      truncated: () => true,
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.listed[0]).toMatchObject({ bidders: 'failed', bidderCount: null });
    expect(result.complete).toBe(false);
  });

  test('bidders of a year with no contract line are not counted for the award', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1')] },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);
    // The lookup is for the contract year found (2569), so the bids belong to it and are counted.
    expect((await service.find('tor-1', 'officer')).listed[0]!.bidderCount).toBe(2);
  });

  test('a winner with no published name is no determined winner', async () => {
    const { client } = fakeClient({
      rowsByYear: {
        2569: [
          row('p1', { contract: [{ contract_no: 'C', winner_name: '   ', price_agree: 900_000 }] }),
        ],
      },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const [item] = (await service.find('tor-1', 'officer')).listed;

    expect(item).toMatchObject({ winnerStatus: 'not_determined', winners: [], clean: false });
    // The bidder count does not depend on the winner.
    expect(item!.bidderCount).toBe(2);
  });
});

describe('SimilarAwardsService: the bidder lookups are limited', () => {
  test('never more than ten lookups, and a project is looked up for all its years or none', async () => {
    // Six projects with contracts in two years each: twelve lookups would be needed.
    const rows = Array.from({ length: 6 }, (_, index) => `p${index + 1}`);
    const { client, calls } = fakeClient({
      rowsByYear: {
        2568: rows.map((id) => row(id, { project_money: 1_000_000 + Number(id.slice(1)) })),
        2569: rows.map((id) => row(id, { project_money: 1_000_000 + Number(id.slice(1)) })),
      },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(calls.submissions.length).toBeLessThanOrEqual(SIMILAR_AWARDS_MAX_BIDDER_CALLS);
    expect(calls.submissions).toHaveLength(10);
    expect(result.bidderCalls).toEqual({ used: 10, max: SIMILAR_AWARDS_MAX_BIDDER_CALLS });
    expect(result.listed.map((item) => item.bidders)).toEqual([
      'read',
      'read',
      'read',
      'read',
      'read',
      'not_asked',
    ]);
    // Each looked-up project was asked for both its years.
    for (const id of rows.slice(0, 5)) {
      expect(
        calls.submissions.filter((call) => call.projectId === id).map((call) => call.year),
      ).toEqual([2569, 2568]);
    }
    expect(calls.submissions.some((call) => call.projectId === 'p6')).toBe(false);
    expect(result.complete).toBe(false);
  });

  test('a project that does not fit is skipped, and a later one that does is still looked up', async () => {
    const near = (id: string, offset: number) => row(id, { project_money: 1_000_000 + offset });
    const { client, calls } = fakeClient({
      rowsByYear: {
        // Four projects of two years each use 8 lookups; the next, of three years, would make 11.
        2568: [near('a', 1), near('b', 2), near('c', 3), near('d', 4), near('three', 5)],
        2569: [near('a', 1), near('b', 2), near('c', 3), near('d', 4), near('three', 5)],
        2570: [near('three', 5), near('solo', 6)],
      },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    const state = (id: string) => result.listed.find((item) => item.projectId === id)!.bidders;
    expect(state('three')).toBe('not_asked');
    expect(calls.submissions.some((call) => call.projectId === 'three')).toBe(false);
    expect(state('solo')).toBe('read');
    expect(calls.submissions).toHaveLength(9);
    expect(result.bidderCalls.used).toBe(9);
  });

  test('pauses before every bidder lookup', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: [row('p1'), row('p2')] },
      bidderRows: () => bidders(A, B),
    });
    const { service, pauses } = build(client);

    await service.find('tor-1', 'officer');

    // Two before searches 2 and 3, then one before each of the two lookups.
    expect(pauses).toHaveLength(4);
  });
});

describe('SimilarAwardsService: the competition level', () => {
  const fiveProjects = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      row(`p${index + 1}`, { project_money: 1_000_000 + index }),
    );

  test('is hidden unless at least five listed projects have a known bidder count', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: fiveProjects(4) },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const { competition } = await service.find('tor-1', 'officer');

    expect(competition).toMatchObject({ withKnownBidderCount: 4, level: null, bidders: null });
  });

  test('is given, with its basis, at five', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: fiveProjects(5) },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const { competition } = await service.find('tor-1', 'officer');

    expect(competition).toMatchObject({
      comparables: 5,
      withKnownBidderCount: 5,
      level: 'few',
      minSample: 5,
      minSampleProvisional: true,
      thresholds: { fewMax: 3, provisional: true },
    });
  });

  test('is hidden where the bidders were not looked up, whatever the projects', async () => {
    const { client } = fakeClient({ rowsByYear: { 2569: fiveProjects(5) }, bidderRows: () => [] });
    const { service } = build(client);

    const { competition } = await service.find('tor-1', 'officer');

    expect(competition).toMatchObject({ withKnownBidderCount: 0, level: null });
    expect(competition!.unknownBidderCounts.no_bids).toBe(5);
  });

  test('is read only from the projects listed, which the response says', async () => {
    const { client } = fakeClient({
      rowsByYear: { 2569: fiveProjects(12) },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.projects).toBe(12);
    expect(result.competition!.comparables).toBe(10);
  });
});

describe('SimilarAwardsService: refusals, errors and the daily allowance', () => {
  test('a refusal stops the request, writes the cooldown, and leaves the later searches unasked', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: { 2568: [row('p1')] },
      failSearch: (year) =>
        year === 2569
          ? new RateLimitedError('https://example.test/', 429, { limitDay: 1000, remainingDay: 0 })
          : null,
    });
    const { service, cooldown } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.searches.map((search) => search.outcome)).toEqual([
      'read',
      'failed',
      'not_asked',
    ]);
    expect(calls.searches.map((call) => call.year)).toEqual([2568, 2569]);
    expect(calls.submissions).toHaveLength(0);
    expect(result.listed[0]!.bidders).toBe('not_asked');
    expect(result.complete).toBe(false);
    expect(cooldown.until).not.toBeNull();
    expect(cooldown.until! > NOW.toISOString()).toBe(true);
  });

  test('after a refusal the next request makes no call at all', async () => {
    const { client, calls } = fakeClient({
      failSearch: () =>
        new RateLimitedError('https://example.test/', 429, { limitDay: 1000, remainingDay: 0 }),
    });
    const { service } = build(client);

    await service.find('tor-1', 'officer');
    const before = calls.searches.length;
    const again = await service.find('tor-1', 'officer');

    expect(again.status).toBe('cooling_down');
    expect(calls.searches).toHaveLength(before);
  });

  test('an ordinary error stops the request but does not write a cooldown', async () => {
    const { client, calls } = fakeClient({
      failSearch: (year) => (year === 2568 ? new UpstreamError('HTTP 500') : null),
    });
    const { service, cooldown } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(result.searches.map((search) => search.outcome)).toEqual([
      'failed',
      'not_asked',
      'not_asked',
    ]);
    expect(calls.searches).toHaveLength(1);
    expect(cooldown.until).toBeNull();
    expect(result.complete).toBe(false);
  });

  test('a refusal on a bidder lookup stops the lookups and writes the cooldown', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: { 2569: [row('p1'), row('p2')] },
      bidderRows: () => bidders(A, B),
      failSubmissions: (id) =>
        id === 'p1'
          ? new RateLimitedError('https://example.test/', 429, { limitDay: 1000, remainingDay: 0 })
          : null,
    });
    const { service, cooldown } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(calls.submissions).toEqual([{ projectId: 'p1', year: 2569 }]);
    expect(result.listed.map((item) => item.bidders)).toEqual(['failed', 'not_asked']);
    expect(cooldown.until).not.toBeNull();
  });

  test('an ordinary error on a bidder lookup stops the lookups without a cooldown', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: { 2569: [row('p1'), row('p2')] },
      bidderRows: () => bidders(A, B),
      failSubmissions: () => new UpstreamError('HTTP 500'),
    });
    const { service, cooldown } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(calls.submissions).toHaveLength(1);
    expect(result.listed.map((item) => item.bidders)).toEqual(['failed', 'not_asked']);
    expect(cooldown.until).toBeNull();
  });

  test('when the API says the day is used up, the request stops and the cooldown is written', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: { 2568: [row('p1')], 2569: [row('p2')] },
      remainingAfterSearch: (year) => (year === 2568 ? 0 : null),
    });
    const { service, cooldown } = build(client);

    const result = await service.find('tor-1', 'officer');

    expect(calls.searches).toHaveLength(1);
    expect(result.searches.map((search) => search.outcome)).toEqual([
      'read',
      'not_asked',
      'not_asked',
    ]);
    expect(calls.submissions).toHaveLength(0);
    expect(cooldown.until).not.toBeNull();
  });
});

describe('SimilarAwardsService: the best-effort cache', () => {
  test('the same TOR asked again within a day costs no call, and says it was cached', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: { 2569: [row('p1')] },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const first = await service.find('tor-1', 'officer');
    const searches = calls.searches.length;
    const submissions = calls.submissions.length;
    const second = await service.find('tor-1', 'officer');

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect({ ...second, cached: false }).toEqual(first);
    expect(calls.searches).toHaveLength(searches);
    expect(calls.submissions).toHaveLength(submissions);
  });

  test('after a day it asks again', async () => {
    let now = NOW;
    const { client, calls } = fakeClient({
      rowsByYear: { 2569: [row('p1')] },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client, { now: () => now });

    await service.find('tor-1', 'officer');
    now = new Date(NOW.getTime() + SIMILAR_AWARDS_CACHE_MS - 1);
    await service.find('tor-1', 'officer');
    expect(calls.searches).toHaveLength(3);

    now = new Date(NOW.getTime() + SIMILAR_AWARDS_CACHE_MS);
    const refreshed = await service.find('tor-1', 'officer');

    expect(calls.searches).toHaveLength(6);
    expect(refreshed.cached).toBe(false);
  });

  test('an incomplete result is never kept: trying again asks again', async () => {
    let fail = true;
    const { client, calls } = fakeClient({
      rowsByYear: { 2568: [row('p1')] },
      failSearch: (year) => (year === 2569 && fail ? new UpstreamError('HTTP 500') : null),
    });
    const { service } = build(client);

    const first = await service.find('tor-1', 'officer');
    fail = false;
    const second = await service.find('tor-1', 'officer');

    expect(first.complete).toBe(false);
    expect(second.complete).toBe(true);
    expect(second.cached).toBe(false);
    expect(calls.searches.length).toBeGreaterThan(3);
  });

  test('a cache is not served to a TOR that is no longer visible', async () => {
    const { client } = fakeClient({ rowsByYear: { 2569: [row('p1')] } });
    const { service, tors } = build(client);
    await service.find('tor-1', 'officer');

    tors.get = async () => {
      throw new NotFoundError('No ingested project tor-1');
    };

    await expect(service.find('tor-1', 'officer')).rejects.toBeInstanceOf(NotFoundError);
  });

  test('two requests at once for one TOR make one set of calls', async () => {
    const { client, calls } = fakeClient({
      rowsByYear: { 2569: [row('p1')] },
      bidderRows: () => bidders(A, B),
    });
    const { service } = build(client);

    const [first, second] = await Promise.all([
      service.find('tor-1', 'officer'),
      service.find('tor-1', 'officer'),
    ]);

    expect(calls.searches).toHaveLength(3);
    expect(second).toEqual(first);
  });

  test('a second TOR is a separate search', async () => {
    const { client, calls } = fakeClient({});
    const { service, tors } = build(client);

    await service.find('tor-1', 'officer');
    tors.get = async () => tor({ projectId: 'tor-2' });
    await service.find('tor-2', 'officer');

    expect(calls.searches).toHaveLength(6);
  });
});
