import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';
import { GOOD_PASSWORD } from '../testing/passwords';

/** ASVS V8.2.1, V15.3.3 (mass assignment) / threat T-06: admin is granted, never claimed. */
describe('privilege escalation attempts', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;

  beforeAll(async () => {
    users = new InMemoryUserStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
  });
  afterAll(async () => {
    await app.close();
  });

  test('registering with role=admin in the body still creates an officer', async () => {
    const password = GOOD_PASSWORD;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'sneaky',
        password,
        confirm_password: password,
        first_name: 'S',
        last_name: 'N',
        role: 'admin',
        is_active: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.role).toBe('business_development_officer');
  });

  test('an officer cannot promote themselves through the admin API', async () => {
    const officer = users.seed({ username: 'climber' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${officer.id}`,
      cookies: {
        [ACCESS_COOKIE]: app.jwt.sign({
          user_id: officer.id,
          username: officer.username,
          role: officer.role,
        }),
      },
      payload: { role: 'admin' },
    });
    expect(res.statusCode).toBe(403);
    expect((await users.findById(officer.id))?.role).toBe('business_development_officer');
  });

  test('an administrator cannot demote or deactivate themselves (no self-targeting)', async () => {
    const admin = users.seed({ username: 'boss', role: 'admin' });
    users.seed({ username: 'second', role: 'admin' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${admin.id}`,
      cookies: {
        [ACCESS_COOKIE]: app.jwt.sign({
          user_id: admin.id,
          username: admin.username,
          role: admin.role,
        }),
      },
      payload: { role: 'business_development_officer' },
    });
    expect(res.statusCode).toBe(403);
  });
});
