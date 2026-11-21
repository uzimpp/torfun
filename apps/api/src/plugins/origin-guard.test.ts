import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';

describe('origin guard (CSRF)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  const post = (origin?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: origin ? { origin } : {},
    });

  beforeAll(async () => {
    app = await buildApp(testEnv({ CORS_ORIGINS: 'http://localhost:3000' }));
  });

  afterAll(async () => {
    await app.close();
  });

  test('refuses an unsafe request from a foreign origin', async () => {
    const response = await post('https://evil.example');
    expect(response.statusCode).toBe(403);
  });

  test('refuses the literal "null" origin (sandboxed iframes, data: URLs)', async () => {
    expect((await post('null')).statusCode).toBe(403);
  });

  test('accepts an unsafe request from an allowed origin', async () => {
    expect((await post('http://localhost:3000')).statusCode).toBe(200);
  });

  test('accepts a request with no Origin (non-browser client)', async () => {
    expect((await post()).statusCode).toBe(200);
  });

  test('does not restrict safe methods', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(response.statusCode).not.toBe(403);
  });
});
