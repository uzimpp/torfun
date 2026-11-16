import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { EnvSchema } from '../config/env';
import { testEnv } from '../testing/env';

/**
 * Criterion 10 (CORS, never `*`) and criterion 13 (HTTP security headers).
 * ASVS V3.4.2, V3.4.1, V3.4.3, V3.4.4, V3.4.5; threats T-04, T-17.
 */
const ALLOWED = 'https://app.torfun.example';

describe('CORS', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal', CORS_ORIGINS: ALLOWED }));
  });
  afterAll(async () => {
    await app.close();
  });

  const preflight = (origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: { origin, 'access-control-request-method': 'POST' },
    });

  test('an allowlisted origin is echoed back, with credentials', async () => {
    const res = await preflight(ALLOWED);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('an unlisted origin gets no CORS grant', async () => {
    const res = await preflight('https://evil.example');
    // Without Allow-Origin the browser blocks the response, whatever else is set.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('the wildcard is never returned, even to a null origin', async () => {
    for (const origin of ['null', 'https://evil.example', ALLOWED]) {
      const res = await preflight(origin);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    }
  });

  test('a lookalike of the allowed origin is refused', async () => {
    const res = await preflight(`${ALLOWED}.evil.example`);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a wildcard in CORS_ORIGINS fails startup validation', () => {
    for (const bad of ['*', 'https://a.example,*', 'https://*.example']) {
      expect(EnvSchema.safeParse({ ...baseEnv(), CORS_ORIGINS: bad }).success).toBe(false);
    }
  });
});

function baseEnv() {
  return {
    MONGODB_URI: 'mongodb://localhost:27017/x',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    GOOGLE_CLIENT_ID: 'a',
    GOOGLE_CLIENT_SECRET: 'b',
    GOOGLE_OAUTH_CALLBACK_URL: 'http://localhost:8080/cb',
    GOOGLE_CLOUD_PROJECT: 'p',
    EGP_API_KEY: 'k',
  };
}

describe('API security headers', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }));
  });
  afterAll(async () => {
    await app.close();
  });

  test('responses carry the baseline hardening headers', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/api/health' });

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['referrer-policy']).toBeDefined();
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  });

  test('the framework does not advertise itself', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/api/health' });
    expect(headers['x-powered-by']).toBeUndefined();
    expect(headers['server']).toBeUndefined();
  });

  test('API responses are not cacheable by shared caches when authenticated data is returned', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/api/auth/me' });
    // 401 body here; the point is that no `public` caching directive is sent.
    expect(headers['cache-control'] ?? '').not.toMatch(/public/);
  });

  test('errors are a bare {message}: no stack trace or internals', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(Object.keys(res.json())).toEqual(['message']);
    const unknown = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(unknown.statusCode).toBe(404);
    // Same bare shape, and the requested path is not echoed back.
    expect(unknown.json()).toEqual({ message: 'Not found' });
  });
});
