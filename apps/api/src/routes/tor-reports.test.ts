import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient } from 'mongodb';
import { ACCESS_COOKIE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { TorReportRepository } from '../repositories/tor-report.repository';
import { testEnv } from '../testing/env';
import { InMemoryUserStore } from '../testing/user-store';
import { InMemoryProcurementStore } from '../testing/procurement-store';

const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const client = uri ? new MongoClient(uri) : null;
const getDb = async () => {
  if (!client) throw new Error('No test database configured');
  return (await client.connect()).db('torfun_reports_test');
};
afterAll(async () => {
  if (client) {
    await (await getDb()).dropDatabase();
    await client.close();
  }
});

// Isolated test fixture; never written to the shared procurement collection.
const procurement: Procurement = {
  projectId: 'report-project',
  projectName: 'โครงการพัฒนาระบบ',
  deptName: 'หน่วยงานรัฐ',
  deptSubName: null,
  province: null,
  district: null,
  subdistrict: null,
  registryName: 'รัฐ',
  deptCode: '1',
  year: 2569,
  announceDate: null,
  projectTypeName: null,
  purchaseMethodName: null,
  projectMoney: null,
  priceBuild: null,
  status: 'invitation',
  matchedKeywords: [],
  softwareClass: null,
  softwareScore: null,
  eBidding: null,
  state: 'Completed',
  outcome: 'tor_analysed',
  statusHistory: [],
  zipId: null,
  zipBytes: null,
  archiveMemberCount: null,
  documents: [],
  analysis: null,
  winner: null,
  torAmbiguous: false,
  discoveredAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const describeMongo = client ? describe : describe.skip;
describeMongo('TOR report flow with MongoDB', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let tors: InMemoryProcurementStore;
  let officer: User;
  let admin: User;
  let secondAdmin: User;
  beforeEach(async () => {
    await (await getDb()).collection('tor_reports').deleteMany({});
    users = new InMemoryUserStore();
    officer = users.seed({ email: 'officer@example.com' });
    admin = users.seed({ role: 'admin' });
    secondAdmin = users.seed({ role: 'admin' });
    tors = new InMemoryProcurementStore();
    await tors.upsert(procurement);
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      procurements: tors,
      torReports: new TorReportRepository(getDb),
    });
  });
  afterEach(async () => app.close());
  const cookies = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: user.id,
      username: 'claim-is-not-identity',
      role: user.role,
    }),
  });
  const submit = (
    user: User,
    payload: Record<string, unknown> = { reason: 'incorrect_information' },
    projectId = procurement.projectId,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/tors/${projectId}/reports`,
      cookies: cookies(user),
      payload,
    });

  test('only authenticated users may submit and only admins may read the queue', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/tors/report-project/reports',
          payload: { reason: 'outdated' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/admin/tor-reports' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/tor-reports',
          cookies: cookies(officer),
        })
      ).statusCode,
    ).toBe(403);
  });

  test('an officer submits a persisted report visible to every admin without changing the TOR', async () => {
    const before = await tors.get(procurement.projectId);
    const response = await submit(officer, {
      reason: 'other',
      details: '  ข้อกำหนดขัดแย้งกัน\nโปรดตรวจสอบ  ',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      project_id: procurement.projectId,
      project_name: procurement.projectName,
      reason: 'other',
      details: 'ข้อกำหนดขัดแย้งกัน\nโปรดตรวจสอบ',
      status: 'pending',
      reporter: { id: officer.id, username: officer.username, email: officer.email },
    });
    for (const user of [admin, secondAdmin]) {
      const queue = await app.inject({
        method: 'GET',
        url: '/api/admin/tor-reports',
        cookies: cookies(user),
      });
      expect(queue.statusCode).toBe(200);
      expect(queue.json()).toMatchObject({
        total: 1,
        items: [{ id: response.json().id }],
        limit: 25,
        offset: 0,
      });
    }
    // New repository instance proves storage survives an API restart.
    expect((await new TorReportRepository(getDb).list(25, 0)).total).toBe(1);
    expect(await tors.get(procurement.projectId)).toEqual(before);
  });

  test('administrators can also report TORs as authenticated users', async () => {
    expect((await submit(admin)).statusCode).toBe(201);
  });

  test.each([
    {},
    { reason: 'fake' },
    { reason: ['outdated', 'other'] },
    { reason: 'other' },
    { reason: 'other', details: '  ' },
    { reason: 'other', details: 'a'.repeat(2001) },
    { reason: 'outdated', reporter_id: 'someone-else' },
  ])('rejects invalid reason/details or caller-supplied identity: %j', async (payload) => {
    expect((await submit(officer, payload)).statusCode).toBe(400);
    expect((await new TorReportRepository(getDb).list(25, 0)).total).toBe(0);
  });

  test('does not report a nonexistent or admin-held TOR for an officer', async () => {
    expect((await submit(officer, { reason: 'outdated' }, 'missing')).statusCode).toBe(404);
    await tors.transition(procurement.projectId, 'Completed', 'needs_review');
    expect((await submit(officer)).statusCode).toBe(404);
  });

  test('rejects inactive accounts even with an unexpired cookie', async () => {
    await users.setActive(officer.id, false);
    expect((await submit(officer)).statusCode).toBe(401);
  });

  test('concurrent submissions create one report and different users can report the same TOR', async () => {
    const responses = await Promise.all([submit(officer), submit(officer)]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect((await submit(admin)).statusCode).toBe(201);
    expect((await new TorReportRepository(getDb).list(25, 0)).total).toBe(2);
  });

  test('queue pagination returns total and validates its bounds', async () => {
    await submit(officer);
    await submit(admin);
    const page = await app.inject({
      method: 'GET',
      url: '/api/admin/tor-reports?limit=1&offset=1',
      cookies: cookies(secondAdmin),
    });
    expect(page.json()).toMatchObject({ total: 2, limit: 1, offset: 1 });
    expect(page.json().items).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/tor-reports?limit=101',
          cookies: cookies(admin),
        })
      ).statusCode,
    ).toBe(400);
  });
});
