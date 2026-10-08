import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type Tombstone, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';

/**
 * What the model dropped is the administrator's to review. Dropping leaves a
 * tombstone; this is where a person reads why. Lifting one is in
 * `procurement-admin.test.ts`.
 */

const dropped: Tombstone = {
  projectId: '66059313551',
  reason: 'admin_non_software',
  evidence: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
  promptVersion: null,
  decidedAt: '2026-10-02T00:00:00.000Z',
  decidedBy: 'somchai',
};

describe('dropped projects', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let procurements: InMemoryProcurementStore;

  beforeAll(async () => {
    procurements = new InMemoryProcurementStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { procurements });
  });
  afterAll(async () => {
    await app.close();
  });

  const as = (role: User['role']) => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: 'user-1', username: 'tester', role }),
  });

  test('an administrator reads what was dropped and why', async () => {
    await procurements.tombstone(dropped);

    const response = await app.inject({
      method: 'GET',
      url: '/api/ingestion/tombstones',
      cookies: as('admin'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as { items: Tombstone[] }).toEqual({ items: [dropped] });
  });

  test('an officer cannot read the list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/ingestion/tombstones',
      cookies: as('business_development_officer'),
    });

    expect(response.statusCode).toBe(403);
  });

  test('without a session it is not reachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ingestion/tombstones' });

    expect(response.statusCode).toBe(401);
  });
});
