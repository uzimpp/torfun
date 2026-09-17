import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { ACCESS_COOKIE } from '@torfun/types';
import { InMemoryProcurementStore } from '../testing/procurement-store';

/**
 * `/ingestion/run` spends the project's rate-limited allowance against an
 * upstream site that asked not to be crawled, so "is this endpoint reachable
 * without an admin session" is a correctness question, not a nicety.
 */
describe('ingestion route access and procurement query validation', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let officerCookie: Record<string, string>;

  beforeAll(async () => {
    app = await buildApp(testEnv(), { procurements: new InMemoryProcurementStore() });
    officerCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60718',
        username: 'bd-officer',
        role: 'business_development_officer',
      }),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  const routes = [
    { method: 'GET' as const, url: '/api/ingestion/summary' },
    { method: 'GET' as const, url: '/api/ingestion/projects' },
    { method: 'GET' as const, url: '/api/ingestion/projects/abc' },
    { method: 'GET' as const, url: '/api/ingestion/failures' },
    { method: 'POST' as const, url: '/api/ingestion/run' },
  ];

  for (const route of routes) {
    test(`${route.method} ${route.url} rejects an anonymous caller`, async () => {
      const response = await app.inject(route);
      expect(response.statusCode).toBe(401);
    });
  }

  test('a signed-in Business Development Officer can read the procurement index', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/ingestion/projects?limit=20&minBudget=500000',
      cookies: officerCookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  test.each([
    '/api/ingestion/projects?minBudget=20&maxBudget=10',
    '/api/ingestion/projects?publishedFrom=2026-02-30',
    '/api/ingestion/projects?deadlineFrom=2026-10-02&deadlineTo=2026-10-01',
    '/api/ingestion/projects?targetPlatforms=television',
  ])('rejects an invalid filter query: %s', async (url) => {
    const response = await app.inject({ method: 'GET', url, cookies: officerCookie });

    expect(response.statusCode).toBe(400);
  });

  test('a signed-in non-admin remains forbidden from starting a retrieval run', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ingestion/run',
      cookies: officerCookie,
    });

    expect(response.statusCode).toBe(403);
  });
});
