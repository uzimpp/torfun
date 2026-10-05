import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { ACCESS_COOKIE } from '@torfun/types';

/**
 * `/ingestion/run` spends the project's rate-limited allowance against an
 * upstream site that asked not to be crawled, so "is this endpoint reachable
 * without an admin session" is a correctness question, not a nicety.
 */
describe('ingestion routes are admin-only', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(testEnv());
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

  test('a signed-in non-admin is forbidden, not merely unauthenticated', async () => {
    const token = app.jwt.sign({
      user_id: '68b1f0c2a1b2c3d4e5f60718',
      username: 'bd-officer',
      role: 'business_development_officer',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/ingestion/run',
      cookies: { [ACCESS_COOKIE]: token },
    });

    expect(response.statusCode).toBe(403);
  });
});
