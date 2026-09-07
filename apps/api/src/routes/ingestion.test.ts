import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { buildApp } from '../app';
import { ACCESS_COOKIE } from '@torfun/types';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/torfun-test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.GOOGLE_OAUTH_CALLBACK_URL ??= 'http://localhost:8080/api/auth/google/callback';
process.env.GOOGLE_CLOUD_PROJECT ??= 'torfun-test';
process.env.EGP_API_KEY ??= 'test-egp-key';
if (process.env.NOTIFICATION_FROM_EMAIL === '') delete process.env.NOTIFICATION_FROM_EMAIL;

/**
 * `/ingestion/run` spends the project's rate-limited allowance against an
 * upstream site that asked not to be crawled, so "is this endpoint reachable
 * without an admin session" is a correctness question, not a nicety.
 */
describe('ingestion routes are admin-only', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const { buildApp } = await import('../app');
    app = await buildApp();
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
