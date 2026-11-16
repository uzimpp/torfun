import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';
import { GOOD_PASSWORD, WRONG_PASSWORD } from '../testing/passwords';

/**
 * ASVS V16.3.1, V16.3.2, V16.4.1 / threat T-16: auth and admin events leave a
 * structured record, and no secret ever lands in it (V16.2.5, T-11).
 */
describe('audit trail', () => {
  const lines: Array<Record<string, unknown>> = [];
  let raw = '';
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;

  const stream = new Writable({
    write(chunk, _enc, done) {
      raw += String(chunk);
      for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
      done();
    },
  });
  const events = () => lines.filter((l) => l.audit === true).map((l) => l.event);

  beforeAll(async () => {
    users = new InMemoryUserStore();
    app = await buildApp(
      testEnv({ LOG_LEVEL: 'info' }),
      { users, refreshTokens: new InMemoryRefreshTokenStore() },
      { logStream: stream },
    );
  });
  afterAll(async () => {
    await app.close();
  });

  const PASSWORD = GOOD_PASSWORD;

  test('register, failed login, successful login and logout are all recorded', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: 'audit-user',
        password: PASSWORD,
        confirm_password: PASSWORD,
        first_name: 'A',
        last_name: 'B',
      },
    });
    expect(reg.statusCode).toBe(201);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'audit-user', password: WRONG_PASSWORD },
    });
    expect(bad.statusCode).toBe(401);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'audit-user', password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);

    await app.inject({ method: 'POST', url: '/api/auth/logout' });

    expect(events()).toEqual(
      expect.arrayContaining([
        'auth.register',
        'auth.login.failure',
        'auth.login.success',
        'auth.logout',
      ]),
    );
  });

  test('a failed login for an unknown user and for a wrong password look identical', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody-here', password: 'whatever-123456' },
    });
    const failures = lines.filter((l) => l.event === 'auth.login.failure');
    expect(new Set(failures.map((f) => f.reason)).size).toBe(1);
  });

  test('lockout is recorded', async () => {
    for (let i = 0; i < 11; i += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'lockout-target', password: WRONG_PASSWORD },
      });
    }
    expect(events()).toContain('auth.throttled');
  });

  test('an administrator changing an account is recorded with both ids', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    const target = users.seed({ username: 'victim' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${target.id}`,
      cookies: {
        [ACCESS_COOKIE]: app.jwt.sign({
          user_id: admin.id,
          username: admin.username,
          role: admin.role,
        }),
      },
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(200);
    const record = lines.find((l) => l.event === 'admin.user.updated');
    expect(record).toMatchObject({ userId: admin.id, targetUserId: target.id, isActive: false });
  });

  test('no password, token or cookie value appears anywhere in the log', () => {
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(WRONG_PASSWORD);
    expect(raw).not.toMatch(/torfun_(access|refresh)=|eyJ[A-Za-z0-9_-]{10,}\./);
  });
});
