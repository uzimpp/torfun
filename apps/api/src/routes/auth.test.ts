import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { ACCESS_COOKIE, type User } from '@torfun/types';
import { InMemoryCompanyStore } from '../testing/company-store';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';

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

/**
 * Registration and `/me` after the Company became a record of its own.
 *
 * These run against in-memory stores through `buildApp`'s second parameter, so
 * a real account is created and read back without a database.
 */
describe('registration and the current user', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let companies: InMemoryCompanyStore;

  const register = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/auth/register', payload });

  beforeAll(async () => {
    users = new InMemoryUserStore();
    companies = new InMemoryCompanyStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      companies,
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  test('registering asks for no company at all', async () => {
    const response = await register({
      username: 'somchai',
      password: 'a-long-enough-password',
      confirm_password: 'a-long-enough-password',
      first_name: 'Somchai',
      last_name: 'Prasert',
    });

    expect(response.statusCode).toBe(201);
    // The question is asked once, on the company page — a new account simply
    // has no company yet, which is what the web gate redirects on.
    expect(response.json().user).toMatchObject({ company_id: null, company_name: null });
  });

  test('/me resolves the name from the Company once one is joined', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const user = users.seed({ username: 'malee', companyId: company.id });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: {
        [ACCESS_COOKIE]: app.jwt.sign({
          user_id: user.id,
          username: user.username,
          role: user.role,
        }),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      company_id: company.id,
      company_name: 'บริษัท สยามซอฟต์ จำกัด',
    });
  });
});

describe('account settings', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const users = new InMemoryUserStore();
  const profile = { first_name: '  สมชาย  ', last_name: '' };
  const password = { current_password: 'original-password', new_password: 'replacement-password' };

  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({ user_id: user.id, username: user.username, role: user.role }),
  });
  const patch = (path: string, payload: object, user?: User) =>
    app.inject({
      method: 'PATCH',
      url: `/api/auth/me${path}`,
      payload,
      cookies: user && session(user),
    });
  const read = (user: User) =>
    app.inject({ method: 'GET', url: '/api/auth/me', cookies: session(user) });

  beforeAll(async () => {
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      companies: new InMemoryCompanyStore(),
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  test('requires a session for both mutations', async () => {
    expect((await patch('', profile)).statusCode).toBe(401);
    expect((await patch('/password', password)).statusCode).toBe(401);
  });

  test.each(['business_development_officer', 'admin'] as const)(
    'lets %s update their profile and change their password with the current password',
    async (role) => {
      const username = `settings-${role}`;
      const registered = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          username,
          first_name: 'Original',
          last_name: 'Name',
          password: password.current_password,
          confirm_password: password.current_password,
        },
      });
      expect(registered.statusCode).toBe(201);
      const id = registered.json().user.id;
      await users.setRole(id, role);
      const user = (await users.findById(id))!;
      const other = users.seed();
      const login = (value: string) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { username, password: value },
        });

      expect((await read(user)).json()).toMatchObject({
        first_name: 'Original',
        has_local_password: true,
      });
      expect((await patch('', { ...profile, id: other.id, role: 'admin' }, user)).statusCode).toBe(
        400,
      );
      expect((await patch('/password', { ...password, id: other.id }, user)).statusCode).toBe(400);
      expect((await patch('', profile, user)).statusCode).toBe(204);
      expect((await read(user)).json()).toMatchObject({
        id,
        role,
        first_name: 'สมชาย',
        last_name: '',
      });
      expect((await read(other)).json()).toMatchObject({ first_name: other.firstName });

      const incorrect = await patch('/password', { ...password, current_password: 'wrong' }, user);
      expect(incorrect.statusCode).toBe(400);
      expect(incorrect.json().message).toBe('Current password is incorrect');
      expect(
        (await patch('/password', { ...password, new_password: 'ก'.repeat(25) }, user)).statusCode,
      ).toBe(400);
      expect((await patch('/password', password, user)).statusCode).toBe(204);
      expect((await login(password.current_password)).statusCode).toBe(401);
      expect((await login(password.new_password)).statusCode).toBe(200);
      expect((await read(other)).json()).toMatchObject({ has_local_password: false });
    },
    15_000,
  );

  test('allows profile edits for Google-only users and rejects password changes', async () => {
    const { user } = await app.authService.loginWithGoogle({
      sub: 'google-settings',
      email: 'settings@example.com',
    });
    expect((await read(user)).json()).toMatchObject({ has_local_password: false });
    expect((await patch('', profile, user)).statusCode).toBe(204);
    expect((await patch('/password', password, user)).statusCode).toBe(403);
  });
});
