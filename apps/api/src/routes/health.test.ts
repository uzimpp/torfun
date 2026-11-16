import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(testEnv());
  });

  afterAll(async () => {
    await app.close();
  });

  test('returns ok status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });
});

describe('GET /api/health/dependencies', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(testEnv());
  });

  afterAll(async () => {
    await app.close();
  });

  test('is admin-only — dependency detail is not public', async () => {
    // The detail names hosts, regions and models, and says which credential is
    // wrong. That is a map for anyone probing the deployment.
    const response = await app.inject({ method: 'GET', url: '/api/health/dependencies' });
    expect(response.statusCode).toBe(401);
  });

  test('liveness stays independent of it, so nothing else can take the app down', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
  });
});
