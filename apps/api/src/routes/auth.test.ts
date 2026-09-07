import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { buildApp } from '../app';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/torfun-test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.GOOGLE_OAUTH_CALLBACK_URL ??= 'http://localhost:8080/api/auth/google/callback';
process.env.GOOGLE_CLOUD_PROJECT ??= 'torfun-test';
process.env.EGP_API_KEY ??= 'test-egp-key';

/**
 * These exercise the guards in front of the handlers, not the handlers
 * themselves, so every request here omits `password`. That fails schema
 * validation inside the route and returns 400 without reaching the service —
 * which means the whole file runs with no database, in keeping with
 * `buildApp()` being usable without one.
 */
describe('credential endpoint rate limiting', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  const attempt = (username: string) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { username } });

  beforeAll(async () => {
    const { buildApp } = await import('../app');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('throttles repeated attempts against one account', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await attempt('brute-force-target')).statusCode).toBe(400);
    }

    expect((await attempt('brute-force-target')).statusCode).toBe(429);
  });

  test('a throttled account does not lock out everyone else', async () => {
    expect((await attempt('unrelated-user')).statusCode).toBe(400);
  });

  test('the username key is case-insensitive', async () => {
    const response = await attempt('BRUTE-FORCE-TARGET');

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
  });
});

/**
 * The second layer, on a fresh instance so it starts with an empty counter:
 * one host is capped even when it never repeats a username, which is what
 * password spraying looks like.
 */
describe('credential endpoint per-IP limit', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const { buildApp } = await import('../app');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('caps one host spraying many accounts', async () => {
    const spray = (index: number) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: `victim-${index}` },
      });

    for (let i = 0; i < 30; i += 1) {
      expect((await spray(i)).statusCode).toBe(400);
    }

    expect((await spray(30)).statusCode).toBe(429);
  });
});

describe('CORS', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const { buildApp } = await import('../app');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  test('reflects an allowlisted origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('does not reflect an unknown origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://not-torfun.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
