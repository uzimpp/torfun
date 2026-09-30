import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: 'project-1',
    projectName: 'โครงการพัฒนาระบบสารสนเทศ',
    deptName: 'หน่วยงานรัฐ',
    deptSubName: null,
    province: 'กรุงเทพมหานคร',
    district: 'คลองเตย',
    subdistrict: 'คลองเตย',
    registryName: 'หน่วยงานรัฐ',
    deptCode: '1234567890',
    year: 2569,
    announceDate: '1 ตุลาคม 2569',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'e-bidding',
    projectMoney: 4_500_000,
    priceBuild: null,
    status: 'invitation',
    matchedKeywords: ['ระบบสารสนเทศ'],
    softwareClass: 'new_build',
    softwareScore: 8,
    eBidding: true,
    state: 'Completed',
    outcome: 'tor_analysed',
    statusHistory: [],
    zipId: 'zip-1',
    zipBytes: 100,
    archiveMemberCount: 1,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('TOR detail routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let procurements: InMemoryProcurementStore;

  beforeEach(async () => {
    procurements = new InMemoryProcurementStore();
    await procurements.upsert(procurement());
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { procurements });
  });

  afterEach(async () => {
    await app.close();
  });

  const session = (role: User['role'] = 'business_development_officer') => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: 'user-1',
      username: 'tester',
      role,
    }),
  });

  test('rejects an anonymous caller', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tors/project-1' });
    expect(response.statusCode).toBe(401);
  });

  test('rejects an anonymous caller from the procurement index', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tors' });
    expect(response.statusCode).toBe(401);
  });

  test('returns an existing procurement to an authenticated officer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/project-1',
      cookies: session(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      projectId: 'project-1',
      projectName: 'โครงการพัฒนาระบบสารสนเทศ',
      analysis: null,
    });
  });

  test('lists and filters procurements for an authenticated officer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors?limit=20&minBudget=500000&location=กรุงเทพมหานคร',
      cookies: session(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ projectId: 'project-1' }],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  test.each([
    '/api/tors?minBudget=20&maxBudget=10',
    '/api/tors?publishedFrom=2026-02-30',
    '/api/tors?deadlineFrom=2026-10-02&deadlineTo=2026-10-01',
    '/api/tors?targetPlatforms=television',
  ])('rejects an invalid officer filter query: %s', async (url) => {
    const response = await app.inject({ method: 'GET', url, cookies: session() });

    expect(response.statusCode).toBe(400);
  });

  test('returns an existing procurement to an administrator', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/project-1',
      cookies: session('admin'),
    });

    expect(response.statusCode).toBe(200);
  });

  test('returns 404 for an unknown project', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tors/missing',
      cookies: session(),
    });

    expect(response.statusCode).toBe(404);
  });
});
