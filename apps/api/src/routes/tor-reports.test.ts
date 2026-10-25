import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient } from 'mongodb';
import { zipSync } from 'fflate';
import { ACCESS_COOKIE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { TorReportRepository } from '../repositories/tor-report.repository';
import { testEnv } from '../testing/env';
import { InMemoryUserStore } from '../testing/user-store';
import { ProcurementRepository } from '../repositories/procurement.repository';
import { TorService } from '../services/tor.service';

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
  let tors: ProcurementRepository;
  let officer: User;
  let admin: User;
  let secondAdmin: User;
  beforeEach(async () => {
    await (await getDb()).collection('tor_reports').deleteMany({});
    await (await getDb()).collection('procurements').deleteMany({});
    users = new InMemoryUserStore();
    officer = users.seed({ email: 'officer@example.com' });
    admin = users.seed({ role: 'admin' });
    secondAdmin = users.seed({ role: 'admin' });
    tors = new ProcurementRepository(getDb);
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

  const review = (user: User, id: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/api/admin/tor-reports/${id}`,
      cookies: cookies(user),
      payload,
    });
  const queue = (user: User, status = 'pending') =>
    app.inject({
      method: 'GET',
      url: `/api/admin/tor-reports?status=${status}`,
      cookies: cookies(user),
    });

  test('dismissal preserves publication and stores the verified reviewer for every admin', async () => {
    const report = (await submit(officer)).json();
    const decision = await review(admin, report.id, {
      action: 'dismiss',
      note: '  ตรวจสอบต้นฉบับแล้ว ข้อมูลถูกต้อง  ',
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json()).toMatchObject({
      status: 'dismissed',
      review: {
        reviewer: { id: admin.id, username: admin.username },
        note: 'ตรวจสอบต้นฉบับแล้ว ข้อมูลถูกต้อง',
      },
    });
    expect((await queue(secondAdmin)).json().total).toBe(0);
    expect((await queue(secondAdmin, 'dismissed')).json().items[0]).toEqual(decision.json());
    expect((await queue(secondAdmin, 'all')).json().total).toBe(1);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/tors/report-project',
          cookies: cookies(officer),
        })
      ).statusCode,
    ).toBe(200);
    expect((await tors.get(procurement.projectId))?.publicationRemovedAt).toBeUndefined();
    expect((await submit(officer)).statusCode).toBe(201);
  });

  test('removal hides list, detail and downloads from officers, preserving admin evidence through ingestion', async () => {
    const report = (await submit(officer)).json();
    const decision = await review(admin, report.id, {
      action: 'remove_tor',
      note: 'เงื่อนไขไม่ถูกต้อง',
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().status).toBe('removed');
    const stored = await tors.get(procurement.projectId);
    expect(stored?.publicationRemovedAt).toBe(decision.json().review.reviewed_at);
    expect(stored?.status).toBe(procurement.status);
    expect(stored?.state).toBe(procurement.state);
    expect(
      (await app.inject({ method: 'GET', url: '/api/tors', cookies: cookies(officer) })).json(),
    ).toMatchObject({ items: [], total: 0 });
    for (const suffix of ['', '/source']) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/tors/report-project${suffix}`,
            cookies: cookies(officer),
          })
        ).statusCode,
      ).toBe(404);
    }
    const detail = await app.inject({
      method: 'GET',
      url: '/api/tors/report-project',
      cookies: cookies(secondAdmin),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().publicationRemovedAt).toBe(stored?.publicationRemovedAt);
    expect((await queue(secondAdmin, 'removed')).json().items[0].reporter.id).toBe(officer.id);
    expect((await submit(officer)).statusCode).toBe(404);
    expect((await submit(admin)).statusCode).toBe(409);
    // Neither rediscovery nor later retrieval transitions may republish it.
    await tors.upsert({ ...procurement, projectName: 'ชื่อโครงการที่อัปเดตจากต้นทาง' });
    await tors.transition(procurement.projectId, 'Completed', 'tor_analysed');
    expect((await tors.get(procurement.projectId))?.publicationRemovedAt).toBe(
      stored?.publicationRemovedAt,
    );
    expect(
      (await app.inject({ method: 'GET', url: '/api/tors', cookies: cookies(officer) })).json()
        .total,
    ).toBe(0);
    expect(
      (await app.inject({ method: 'GET', url: '/api/tors', cookies: cookies(admin) })).json().total,
    ).toBe(1);
  });

  test('review rejects anonymous, officer, inactive and demoted callers, including stale admin tokens', async () => {
    const id = (await submit(officer)).json().id;
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/admin/tor-reports/${id}`,
          payload: { action: 'dismiss' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await review(officer, id, { action: 'dismiss' })).statusCode).toBe(403);
    await users.setRole(admin.id, 'business_development_officer');
    expect((await review(admin, id, { action: 'dismiss' })).statusCode).toBe(403);
    expect((await queue(admin)).statusCode).toBe(403);
    await users.setActive(secondAdmin.id, false);
    expect((await review(secondAdmin, id, { action: 'remove_tor' })).statusCode).toBe(401);
    expect((await queue(secondAdmin)).statusCode).toBe(401);
  });

  test.each([
    {},
    { action: 'delete' },
    { action: 'dismiss', reviewer_id: 'forged' },
    { action: 'dismiss', note: 'x'.repeat(2001) },
  ])('rejects invalid review input: %j', async (input) => {
    const id = (await submit(officer)).json().id;
    expect((await review(admin, id, input)).statusCode).toBe(400);
    expect((await queue(admin)).json().total).toBe(1);
  });

  test('a report can only be decided once even when two administrators act concurrently', async () => {
    const id = (await submit(officer)).json().id;
    const results = await Promise.all([
      review(admin, id, { action: 'dismiss' }),
      review(secondAdmin, id, { action: 'remove_tor' }),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    const winner = results.find((result) => result.statusCode === 200)?.json();
    const history = (await queue(admin, 'all')).json().items[0];
    expect(history).toEqual(winner);
    expect(Boolean((await tors.get(procurement.projectId))?.publicationRemovedAt)).toBe(
      history.status === 'removed',
    );
    expect((await review(admin, id, { action: 'dismiss' })).statusCode).toBe(409);
  });

  test('missing reports and invalid status filters are rejected; an absent TOR can still be dismissed', async () => {
    expect(
      (await review(admin, '000000000000000000000000', { action: 'dismiss' })).statusCode,
    ).toBe(404);
    expect((await review(admin, 'bad-id', { action: 'dismiss' })).statusCode).toBe(400);
    expect((await queue(admin, 'bad-status')).statusCode).toBe(400);
    const id = (await submit(officer)).json().id;
    await (await getDb()).collection('procurements').deleteMany({});
    expect((await review(admin, id, { action: 'remove_tor' })).statusCode).toBe(404);
    expect((await queue(admin)).json().total).toBe(1);
    expect((await review(admin, id, { action: 'dismiss' })).statusCode).toBe(200);
  });

  test('a failed publication write rolls back the report decision', async () => {
    const id = (await submit(officer)).json().id;
    const db = await getDb();
    await db.command({
      collMod: 'procurements',
      validator: { publication_removed_at: { $exists: false } },
    });
    try {
      expect((await review(admin, id, { action: 'remove_tor' })).statusCode).toBe(500);
      const report = (await queue(secondAdmin)).json().items[0];
      expect(report).toMatchObject({ status: 'pending', review: null });
      expect((await tors.get(procurement.projectId))?.publicationRemovedAt).toBeUndefined();
    } finally {
      await db.command({ collMod: 'procurements', validator: {} });
    }
  });

  test('removed TOR source is blocked before download for officers but retained for admins', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\nIsolated source fixture');
    const archive = zipSync({ 'Attach_TOR_1.pdf': pdf });
    let downloads = 0;
    app.torService = new TorService(tors, async () => {
      downloads += 1;
      return archive;
    });
    await tors.transition(procurement.projectId, 'Completed', 'tor_analysed', {
      zipId: 'fixture-archive',
      documents: [
        {
          member: 'Attach_TOR_1.pdf',
          filename: 'Attach_TOR_1.pdf',
          bytes: pdf.length,
          namePattern: 'canonical',
          role: 'main_tor',
          note: 'Isolated test fixture',
        },
      ],
    });
    const source = (user: User) =>
      app.inject({ method: 'GET', url: '/api/tors/report-project/source', cookies: cookies(user) });
    expect((await source(officer)).statusCode).toBe(200);
    expect(downloads).toBe(1);
    const id = (await submit(officer)).json().id;
    expect((await review(admin, id, { action: 'remove_tor' })).statusCode).toBe(200);
    expect((await source(officer)).statusCode).toBe(404);
    expect(downloads).toBe(1);
    const original = await source(secondAdmin);
    expect(original.statusCode).toBe(200);
    expect(original.body).toBe(new TextDecoder().decode(pdf));
    expect(downloads).toBe(2);
  });
});
