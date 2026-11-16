import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { SESSION_ABSOLUTE_SECONDS } from '../services/auth.service';
import { testEnv } from '../testing/env';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';

/**
 * Advanced feature: JWT expiry and session management (issue #170).
 * ASVS V7.2.1, V7.3.1, V7.3.2, V7.4.1, V7.4.2, V7.4.3, V9.2.1 / threat T-03.
 *
 * A session is a refresh-token family. Every access token names it (`sid`), so
 * ending the family ends the access token too, without waiting out its 15 minutes.
 */
describe('session management', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let tokens: InMemoryRefreshTokenStore;
  let n = 0;

  beforeAll(async () => {
    users = new InMemoryUserStore();
    tokens = new InMemoryRefreshTokenStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { users, refreshTokens: tokens });
  });
  afterAll(async () => {
    await app.close();
  });

  const PASSWORD = 'plum-lantern-torque-58';
  const cookiesOf = (res: { cookies: Array<{ name: string; value: string }> }) =>
    Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));

  async function signUp() {
    n += 1;
    const username = `session-user-${n}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username,
        password: PASSWORD,
        confirm_password: PASSWORD,
        first_name: 'S',
        last_name: 'U',
      },
    });
    expect(res.statusCode).toBe(201);
    const c = cookiesOf(res);
    return {
      username,
      id: res.json().user.id as string,
      access: c[ACCESS_COOKIE]!,
      refresh: c[REFRESH_COOKIE]!,
    };
  }
  const me = (access: string) =>
    app.inject({ method: 'GET', url: '/api/auth/me', cookies: { [ACCESS_COOKIE]: access } });

  test('the access token lives 15 minutes and names its session', async () => {
    const s = await signUp();
    const claims = app.jwt.decode<{ exp: number; iat: number; sid?: string }>(s.access);
    expect(claims!.exp - claims!.iat).toBe(15 * 60);
    expect(claims!.sid).toBeTruthy();
  });

  test('logout ends the access token immediately', async () => {
    const s = await signUp();
    expect((await me(s.access)).statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { [REFRESH_COOKIE]: s.refresh },
    });

    expect((await me(s.access)).statusCode).toBe(401);
  });

  test('reusing a rotated refresh token revokes the whole session, access token included', async () => {
    const s = await signUp();
    const rotated = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { [REFRESH_COOKIE]: s.refresh },
    });
    expect(rotated.statusCode).toBe(200);
    const fresh = cookiesOf(rotated);
    expect((await me(fresh[ACCESS_COOKIE]!)).statusCode).toBe(200);

    // The old refresh token comes back: a copy has leaked.
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { [REFRESH_COOKIE]: s.refresh },
    });
    expect(replay.statusCode).toBe(401);
    expect((await me(fresh[ACCESS_COOKIE]!)).statusCode).toBe(401);
  });

  test('disabling an account ends its live session at once', async () => {
    const s = await signUp();
    const admin = users.seed({ username: `root-${n}`, role: 'admin' });
    users.seed({ username: `root2-${n}`, role: 'admin' });
    const adminCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: admin.id,
        username: admin.username,
        role: admin.role,
      }),
    };

    expect((await me(s.access)).statusCode).toBe(200);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${s.id}`,
      cookies: adminCookie,
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(200);

    expect((await me(s.access)).statusCode).toBe(401);
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { [REFRESH_COOKIE]: s.refresh },
    });
    expect(refresh.statusCode).toBe(401);
  });

  test('a session older than the absolute limit cannot be refreshed', async () => {
    const s = await signUp();
    const sid = app.jwt.decode<{ sid: string }>(s.access)!.sid;
    tokens.backdate(sid, new Date(Date.now() - (SESSION_ABSOLUTE_SECONDS + 60) * 1000));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { [REFRESH_COOKIE]: s.refresh },
    });
    expect(res.statusCode).toBe(401);
  });

  test('the idle window is 7 days and the cookie says so', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: `cookie-user-${++n}`,
        password: PASSWORD,
        confirm_password: PASSWORD,
        first_name: 'C',
        last_name: 'U',
      },
    });
    const refresh = res.cookies.find((c) => c.name === REFRESH_COOKIE)!;
    expect(refresh.maxAge).toBe(7 * 24 * 60 * 60);
    expect(refresh.httpOnly).toBe(true);
    expect(refresh.sameSite).toBe('Lax');
    expect(refresh.path).toBe('/api/auth');
  });

  describe('password change', () => {
    const change = (s: { access: string }, body: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/password',
        cookies: { [ACCESS_COOKIE]: s.access },
        payload: body,
      });

    test('needs a session', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/password',
        payload: { current_password: PASSWORD, new_password: 'another-long-secret-91' },
      });
      expect(res.statusCode).toBe(401);
    });

    test('rejects a wrong current password, a weak new one and an unchanged one', async () => {
      const s = await signUp();
      expect(
        (
          await change(s, {
            current_password: 'not-my-password-1',
            new_password: 'another-long-secret-91',
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (await change(s, { current_password: PASSWORD, new_password: 'password1' })).statusCode,
      ).toBe(400);
      expect(
        (await change(s, { current_password: PASSWORD, new_password: PASSWORD })).statusCode,
      ).toBe(400);
      // Nothing above ended the session.
      expect((await me(s.access)).statusCode).toBe(200);
    });

    test('ends every other session, keeps the caller signed in, and the new password works', async () => {
      const s = await signUp();
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: s.username, password: PASSWORD },
      });
      const otherDevice = cookiesOf(login);

      const NEW = 'another-long-secret-91';
      const res = await change(s, { current_password: PASSWORD, new_password: NEW });
      expect(res.statusCode).toBe(200);
      const fresh = cookiesOf(res);

      expect((await me(s.access)).statusCode).toBe(401);
      expect((await me(otherDevice[ACCESS_COOKIE]!)).statusCode).toBe(401);
      expect((await me(fresh[ACCESS_COOKIE]!)).statusCode).toBe(200);

      const oldLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: s.username, password: PASSWORD },
      });
      expect(oldLogin.statusCode).toBe(401);
      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: s.username, password: NEW },
      });
      expect(newLogin.statusCode).toBe(200);
    });
  });
});
