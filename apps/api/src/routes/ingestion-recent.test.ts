import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';

/**
 * The admin dashboard's "what just changed" list: the procurements most
 * recently pulled or updated by a run, newest first. Admin-only, like the rest
 * of the queue's diagnostics.
 */

function procurement(projectId: string, updatedAt: string): Procurement {
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
    status: 'unknown',
    statusSource: null,
    upstreamStatus: null,
    matchedKeywords: [],
    softwareClass: 'new_build',
    softwareScore: 1,
    eBidding: true,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    statusHistory: [],
    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    archiveMembers: [],
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    updatedAt,
  };
}

describe('GET /api/ingestion/recent', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const procurements = new InMemoryProcurementStore();
    // Deliberately inserted out of order so ordering is the route's doing.
    await procurements.upsert(procurement('mid', '2026-09-20T00:00:00.000Z'));
    await procurements.upsert(procurement('newest', '2026-09-30T00:00:00.000Z'));
    await procurements.upsert(procurement('oldest', '2026-09-10T00:00:00.000Z'));
    for (let index = 0; index < 25; index += 1) {
      await procurements.upsert(
        procurement(
          `bulk-${index}`,
          `2026-08-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        ),
      );
    }
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { procurements });
  });

  afterAll(async () => {
    await app.close();
  });

  const session = (role: User['role']) => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: 'user-1', username: 'tester', role }),
  });

  const recent = async (query = '', role: User['role'] = 'admin') =>
    app.inject({
      method: 'GET',
      url: `/api/ingestion/recent${query}`,
      cookies: session(role),
    });

  test('returns the most recently updated procurements, newest first', async () => {
    const response = await recent('?limit=3');
    expect(response.statusCode).toBe(200);
    const ids = (response.json() as { items: Procurement[] }).items.map((item) => item.projectId);
    expect(ids).toEqual(['newest', 'mid', 'oldest']);
  });

  test('defaults to five', async () => {
    const response = await recent();
    expect((response.json() as { items: Procurement[] }).items).toHaveLength(5);
  });

  test('clamps the limit at twenty', async () => {
    const response = await recent('?limit=500');
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: Procurement[] }).items).toHaveLength(20);
  });

  test('rejects a non-numeric or non-positive limit', async () => {
    expect((await recent('?limit=abc')).statusCode).toBe(400);
    expect((await recent('?limit=0')).statusCode).toBe(400);
  });

  test('an anonymous caller is refused', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ingestion/recent' });
    expect(response.statusCode).toBe(401);
  });

  test('a Business Development Officer is refused', async () => {
    const response = await recent('', 'business_development_officer');
    expect(response.statusCode).toBe(403);
  });
});
