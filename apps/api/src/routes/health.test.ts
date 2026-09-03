import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { buildApp } from '../app';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/torfun-test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.GOOGLE_OAUTH_CALLBACK_URL ??= 'http://localhost:8080/api/auth/google/callback';
process.env.GOOGLE_CLOUD_PROJECT ??= 'torfun-test';
// Tests shouldn't depend on the developer's local .env (auto-loaded by Bun);
// blank-but-present optional vars there (e.g. NOTIFICATION_FROM_EMAIL=) can
// fail stricter optional schemas that only treat *absent* as unset.
if (process.env.NOTIFICATION_FROM_EMAIL === '') delete process.env.NOTIFICATION_FROM_EMAIL;

describe('GET /api/health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const { buildApp } = await import('../app');
    app = await buildApp();
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
