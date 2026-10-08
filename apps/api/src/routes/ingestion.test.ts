import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
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
  let adminCookie: Record<string, string>;

  beforeAll(async () => {
    app = await buildApp(testEnv(), { procurements: new InMemoryProcurementStore() });
    officerCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60718',
        username: 'bd-officer',
        role: 'business_development_officer',
      }),
    };
    adminCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60719',
        username: 'admin',
        role: 'admin',
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

    test(`${route.method} ${route.url} rejects a signed-in non-admin`, async () => {
      const response = await app.inject({ ...route, cookies: officerCookie });
      expect(response.statusCode).toBe(403);
    });
  }

  test('an administrator can filter the ingestion procurement index', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/ingestion/projects?limit=20&minBudget=500000&location=กรุงเทพมหานคร',
      cookies: adminCookie,
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
    const response = await app.inject({ method: 'GET', url, cookies: adminCookie });

    expect(response.statusCode).toBe(400);
  });

  describe('an administrator starting a run', () => {
    const start = async (payload: unknown) => {
      const startRun = mock(async () => {});
      const original = app.ingestionService.startRun.bind(app.ingestionService);
      app.ingestionService.startRun = startRun;
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/ingestion/run',
          cookies: adminCookie,
          payload: payload as Record<string, unknown>,
        });
        return { response, startRun };
      } finally {
        app.ingestionService.startRun = original;
      }
    };

    test('can ask for a fresh discovery sweep, and the service is told', async () => {
      const { response, startRun } = await start({ eBiddingOnly: true, forceDiscovery: true });

      expect(response.statusCode).toBe(202);
      expect(startRun).toHaveBeenCalledWith(
        expect.objectContaining({ forceDiscovery: true, eBiddingOnly: true }),
      );
    });

    test('does not force a sweep unless asked', async () => {
      const { startRun } = await start({ eBiddingOnly: true });

      expect(startRun).toHaveBeenCalledWith(expect.not.objectContaining({ forceDiscovery: true }));
    });
  });
});
