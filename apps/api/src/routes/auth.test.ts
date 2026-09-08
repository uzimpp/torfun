import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';

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
    app = await buildApp(testEnv());
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
    app = await buildApp(testEnv());
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
    app = await buildApp(testEnv());
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

/**
 * Configuration is per-instance, not per-process — the thing a cached
 * `loadEnv()` used to make untestable. The deployed allowlist is not
 * `localhost`, so this asserts the CORS wiring against a realistic value
 * rather than only against the schema default.
 */
describe('CORS honours a deployment-shaped allowlist', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(
      testEnv({ CORS_ORIGINS: 'https://torfun.example,https://admin.torfun.example' }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  test('reflects a configured origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://admin.torfun.example' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('https://admin.torfun.example');
  });

  test('the default localhost origin is not allowed once overridden', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
