import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type IngestionOutcome, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';

/**
 * A Business Development Officer is deciding where to spend days of bid
 * preparation, so what reaches them is only what was actually read: an
 * analysed TOR. Everything else — queued, failed, not software — is the
 * administrator's to see. The rule is enforced here, on the server, because a
 * filter the browser sends is a filter the browser can drop.
 */

function procurement(projectId: string, outcome: IngestionOutcome): Procurement {
  return {
    projectId,
    projectName: `โครงการ ${projectId}`,
    deptName: 'หน่วยงานรัฐ',
    deptSubName: null,
    province: null,
    district: null,
    subdistrict: null,
    registryName: 'หน่วยงานรัฐ',
    deptCode: '1234567890',
    year: 2569,
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: null,
    priceBuild: null,
    status: 'drafting',
    statusSource: 'ai',
    upstreamStatus: null,
    matchedKeywords: [],
    softwareClass: 'new_build',
    softwareScore: 1,
    eBidding: true,
    state: outcome === 'tor_analysed' ? 'Completed' : 'Queued',
    outcome,
    attempts: 0,
    statusHistory: [],
    zipId: 'zip-1',
    zipBytes: 1,
    archiveMemberCount: 1,
    archiveMembers: [],
    documents: [
      {
        member: 'Attach_TOR_1.pdf',
        filename: 'Attach_TOR_1.pdf',
        bytes: 1,
        namePattern: 'canonical',
        role: 'main_tor',
        note: '',
      },
    ],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
  };
}

const OUTCOMES: IngestionOutcome[] = [
  'tor_analysed',
  'not_software',
  'queued',
  'analysis_failed',
  'no_tor_package',
];

describe('what a Business Development Officer may see', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const procurements = new InMemoryProcurementStore();
    for (const outcome of OUTCOMES) await procurements.upsert(procurement(`p-${outcome}`, outcome));
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { procurements });
  });

  afterAll(async () => {
    await app.close();
  });

  const session = (role: User['role']) => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: 'user-1', username: 'tester', role }),
  });
  const officer = () => session('business_development_officer');
  const admin = () => session('admin');

  const listedIds = async (url: string, cookies: Record<string, string>) => {
    const response = await app.inject({ method: 'GET', url, cookies });
    expect(response.statusCode).toBe(200);
    return (response.json() as { items: Procurement[] }).items.map((item) => item.projectId).sort();
  };

  describe('GET /api/tors', () => {
    test('an officer sees only analysed TORs', async () => {
      expect(await listedIds('/api/tors', officer())).toEqual(['p-tor_analysed']);
    });

    test('an officer cannot widen the list with an outcome or state of their own', async () => {
      for (const query of [
        'outcome=queued',
        'outcome=not_software',
        'outcome=analysis_failed',
        'state=Queued',
        'state=Failed',
        'outcome=queued&state=Queued',
      ]) {
        const ids = await listedIds(`/api/tors?${query}`, officer());
        expect(ids.every((id) => id === 'p-tor_analysed')).toBe(true);
      }
    });

    test('the total an officer is told counts only what they can see', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tors',
        cookies: officer(),
      });
      expect((response.json() as { total: number }).total).toBe(1);
    });

    test('an administrator keeps the unfiltered queue', async () => {
      for (const url of ['/api/tors', '/api/ingestion/projects']) {
        expect(await listedIds(url, admin())).toEqual(
          OUTCOMES.map((outcome) => `p-${outcome}`).sort(),
        );
        expect(await listedIds(`${url}?outcome=queued`, admin())).toEqual(['p-queued']);
      }
    });
  });

  describe('single records', () => {
    test('/api/tors/:id is 404 for an officer unless the TOR was analysed', async () => {
      for (const outcome of OUTCOMES) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/tors/p-${outcome}`,
          cookies: officer(),
        });
        expect(response.statusCode).toBe(outcome === 'tor_analysed' ? 200 : 404);
      }
    });

    for (const url of ['/api/ingestion/projects', '/api/tors']) {
      test(`${url}/:id is readable by an administrator whatever the outcome`, async () => {
        for (const outcome of OUTCOMES) {
          const response = await app.inject({
            method: 'GET',
            url: `${url}/p-${outcome}`,
            cookies: admin(),
          });
          expect(response.statusCode).toBe(200);
        }
      });
    }

    test('a hidden record looks exactly like one that does not exist', async () => {
      const hidden = await app.inject({
        method: 'GET',
        url: '/api/tors/p-queued',
        cookies: officer(),
      });
      const missing = await app.inject({
        method: 'GET',
        url: '/api/tors/p-nothing',
        cookies: officer(),
      });
      expect(hidden.statusCode).toBe(404);
      expect((hidden.json() as { message: string }).message.replace('p-queued', 'X')).toBe(
        (missing.json() as { message: string }).message.replace('p-nothing', 'X'),
      );
    });

    test('the source PDF of a record an officer cannot see is 404, before any download', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tors/p-analysis_failed/source',
        cookies: officer(),
      });
      expect(response.statusCode).toBe(404);
      expect((response.json() as { message: string }).message).toContain('No ingested project');
    });
  });
});
