import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { EMPTY_MILESTONES, ACCESS_COOKIE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import type { StartRunInput } from '../services/ingestion.service';

/**
 * The administrator's actions on a procurement, through the whole stack. They
 * are not officer routes and never go through the audience rule: an officer is
 * refused outright, and a held record is the administrator's to list, approve,
 * mark non-software or delete.
 */

const held: Procurement = {
  projectId: '66059313551',
  projectName: 'จ้างพัฒนาระบบสารสนเทศ',
  deptName: 'กรุงเทพมหานคร',
  deptSubName: null,
  province: null,
  district: null,
  subdistrict: null,
  deptCode: '0100',
  budgetYear: 2568,
  announceDate: null,
  projectTypeName: null,
  purchaseMethodName: null,
  projectMoney: null,
  priceBuild: null,
  status: 'open',
  milestones: EMPTY_MILESTONES,
  timelineCheckedAt: null,
  deadlineAt: null,
  deadlineSource: null,
  state: 'Completed',
  outcome: 'needs_review',
  attempts: 0,
  holdReason: 'partial_read',
  approvedBy: null,
  approvedAt: null,
  statusHistory: [],
  zipId: 'zip-1',
  documents: [],
  analysis: null,
  winner: null,
  torAmbiguous: false,
  discoveredAt: '2026-09-09T00:00:00.000Z',
  sourceHash: null,
  updatedAt: '2026-09-09T00:00:00.000Z',
};

const ID = held.projectId;

describe('administrator actions on a procurement', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let store: InMemoryProcurementStore;

  beforeAll(async () => {
    store = new InMemoryProcurementStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { procurements: store });
  });
  beforeEach(async () => {
    await store.remove(ID);
    await store.removeTombstone(ID);
    await store.upsert(held);
  });
  afterAll(async () => {
    await app.close();
  });

  const as = (role: User['role']) => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: 'user-1', username: 'somchai', role }),
  });
  const admin = () => as('admin');
  const officer = () => as('business_development_officer');

  const actions = [
    { name: 'approve', method: 'POST' as const, url: `/api/ingestion/procurements/${ID}/approve` },
    {
      name: 'mark non-software',
      method: 'POST' as const,
      url: `/api/ingestion/procurements/${ID}/non-software`,
    },
    {
      name: 'delete',
      method: 'DELETE' as const,
      url: `/api/ingestion/procurements/${ID}?allowReimport=false`,
    },
  ];

  describe.each(actions)('$name', (action) => {
    test('is refused to an officer and to no session, and changes nothing', async () => {
      const anonymous = await app.inject({ method: action.method, url: action.url });
      const asOfficer = await app.inject({
        method: action.method,
        url: action.url,
        cookies: officer(),
      });

      expect(anonymous.statusCode).toBe(401);
      expect(asOfficer.statusCode).toBe(403);
      expect(await store.get(ID)).toEqual(held);
      expect(await store.listTombstones()).toEqual([]);
    });
  });

  describe('the held list', () => {
    test('is the ordinary list filtered to needs_review, and officers do not see it', async () => {
      const url = '/api/ingestion/projects?outcome=needs_review';

      const asAdmin = await app.inject({ method: 'GET', url, cookies: admin() });
      const asOfficer = await app.inject({
        method: 'GET',
        url: '/api/tors?outcome=needs_review',
        cookies: officer(),
      });

      expect((asAdmin.json() as { items: Procurement[] }).items.map((i) => i.projectId)).toEqual([
        ID,
      ]);
      expect((asOfficer.json() as { total: number }).total).toBe(0);
    });
  });

  describe('POST approve', () => {
    test('204, and officers can now see it without who approved it; an administrator sees who and when', async () => {
      const response = await app.inject({ method: 'POST', url: actions[0]!.url, cookies: admin() });

      expect(response.statusCode).toBe(204);
      const read = (cookies: Record<string, string>) =>
        app.inject({ method: 'GET', url: `/api/tors/${ID}`, cookies });

      const asOfficer = await read(officer());
      expect(asOfficer.statusCode).toBe(200);
      expect(asOfficer.json() as Procurement).toMatchObject({ approvedBy: null, approvedAt: null });

      const record = (await read(admin())).json() as Procurement;
      expect(record.approvedBy).toBe('somchai');
      expect(Date.parse(record.approvedAt!)).not.toBeNaN();
    });

    test('404 for an unknown project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/procurements/nope/approve',
        cookies: admin(),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('message');
    });

    test('409 for a record that is not held', async () => {
      await store.upsert({ ...held, outcome: 'queued', holdReason: null });
      await store.transition(ID, 'queued');

      const response = await app.inject({ method: 'POST', url: actions[0]!.url, cookies: admin() });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toHaveProperty('message');
    });
  });

  describe('POST non-software', () => {
    test('204, the record is gone and a tombstone says who and why', async () => {
      const response = await app.inject({ method: 'POST', url: actions[1]!.url, cookies: admin() });

      expect(response.statusCode).toBe(204);
      expect(await store.get(ID)).toBeUndefined();
      expect(await store.listTombstones()).toEqual([
        expect.objectContaining({
          projectId: ID,
          reason: 'admin_non_software',
          decidedBy: 'somchai',
        }),
      ]);
    });

    test('404 for an unknown project', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ingestion/procurements/nope/non-software',
        cookies: admin(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE', () => {
    test('with allowReimport=false, 204 and a tombstone blocks the project', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: actions[2]!.url,
        cookies: admin(),
      });

      expect(response.statusCode).toBe(204);
      expect(await store.get(ID)).toBeUndefined();
      expect(await store.listTombstones()).toEqual([
        expect.objectContaining({ reason: 'admin_deleted', decidedBy: 'somchai' }),
      ]);
    });

    test('with allowReimport=true, 204 and no tombstone', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/ingestion/procurements/${ID}?allowReimport=true`,
        cookies: admin(),
      });

      expect(response.statusCode).toBe(204);
      expect(await store.get(ID)).toBeUndefined();
      expect(await store.listTombstones()).toEqual([]);
    });

    test.each(['', '?allowReimport=maybe'])(
      'the choice is required, so %p is a 400 and nothing is deleted',
      async (query) => {
        const response = await app.inject({
          method: 'DELETE',
          url: `/api/ingestion/procurements/${ID}${query}`,
          cookies: admin(),
        });

        expect(response.statusCode).toBe(400);
        expect(await store.get(ID)).toEqual(held);
      },
    );

    test('404 for an unknown project', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/ingestion/procurements/nope?allowReimport=true',
        cookies: admin(),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('the tombstones', () => {
    const tombstoneUrl = `/api/ingestion/tombstones/${ID}`;
    const dropRecord = () => app.inject({ method: 'POST', url: actions[1]!.url, cookies: admin() });

    test('are refused to an officer', async () => {
      await dropRecord();

      const remove = await app.inject({ method: 'DELETE', url: tombstoneUrl, cookies: officer() });
      const restore = await app.inject({
        method: 'POST',
        url: `${tombstoneUrl}/restore`,
        cookies: officer(),
      });

      expect(remove.statusCode).toBe(403);
      expect(restore.statusCode).toBe(403);
      expect(await store.listTombstones()).toHaveLength(1);
    });

    test('DELETE removes the entry only: 204, the project is not stored or asked for', async () => {
      await dropRecord();
      const startRun = mock(async () => {});
      const original = app.ingestionService.startRun;
      app.ingestionService.startRun = startRun;

      const response = await app.inject({ method: 'DELETE', url: tombstoneUrl, cookies: admin() });
      app.ingestionService.startRun = original;

      expect(response.statusCode).toBe(204);
      expect(await store.listTombstones()).toEqual([]);
      expect(await store.get(ID)).toBeUndefined();
      expect(startRun).not.toHaveBeenCalled();
    });

    test('DELETE of one that is not there is a 404', async () => {
      const response = await app.inject({ method: 'DELETE', url: tombstoneUrl, cookies: admin() });

      expect(response.statusCode).toBe(404);
    });

    describe('POST restore', () => {
      const restoring = async (startRun: (input: StartRunInput) => Promise<void>) => {
        const original = app.ingestionService.startRun;
        app.ingestionService.startRun = startRun;
        try {
          return await app.inject({
            method: 'POST',
            url: `${tombstoneUrl}/restore`,
            cookies: admin(),
          });
        } finally {
          app.ingestionService.startRun = original;
        }
      };

      test('202, and exactly one Run is asked for, for that project alone', async () => {
        await dropRecord();
        const startRun = mock(async (input: StartRunInput) => {
          await input.beforeRun?.();
        });

        const response = await restoring(startRun);

        expect(response.statusCode).toBe(202);
        expect(startRun).toHaveBeenCalledTimes(1);
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ onlyProject: ID }));
        expect(await store.listTombstones()).toEqual([]);
        // Rebuilt from the tombstone's feed snapshot, ready for that Run to read.
        expect((await store.get(ID))?.outcome).toBe('queued');
      });

      test('409 while a Run is going, and the tombstone stays', async () => {
        await dropRecord();
        const { ConflictError } = await import('../core/errors');

        const response = await restoring(async () => {
          throw new ConflictError('An ingestion run is already in progress.');
        });

        expect(response.statusCode).toBe(409);
        expect(await store.listTombstones()).toHaveLength(1);
      });

      test('404 in Thai when there is no tombstone, and no Run is started to find that out', async () => {
        const startRun = mock(async (input: StartRunInput) => {
          await input.beforeRun?.();
        });

        const response = await restoring(startRun);

        expect(response.statusCode).toBe(404);
        expect((response.json() as { message: string }).message).toMatch(/[฀-๿]/);
        expect(startRun).not.toHaveBeenCalled();
      });
    });
  });
});
