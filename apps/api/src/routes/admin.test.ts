import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryUserStore } from '../testing/user-store';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';

/**
 * The account-management surface at the API's highest seam: a real Fastify
 * instance with an in-memory `UserStore`, driven through `app.inject`. Every
 * assertion is a status code or a body — what a caller can observe.
 *
 * The rules themselves live in `admin-users.service.test.ts`; these tests are
 * about the HTTP contract: admin-only, snake_case on the wire, no
 * `password_hash` leaking, and the domain errors mapped to the right codes.
 */

describe('admin account routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;

  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: user.id,
      username: user.username,
      role: user.role,
    }),
  });

  beforeEach(async () => {
    users = new InMemoryUserStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  test('the account list is not reachable without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(response.statusCode).toBe(401);
  });

  test('a Business Development Officer is turned away from the account list', async () => {
    const officer = users.seed({ username: 'somchai' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: session(officer),
    });

    expect(response.statusCode).toBe(403);
  });

  test('an administrator reads every account, newest first, without any hash', async () => {
    users.seed({ username: 'somchai', companyId: 'company-1' });
    const admin = users.seed({ username: 'root', role: 'admin' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: session(admin),
    });

    expect(response.statusCode).toBe(200);
    const { users: listed } = response.json<{ users: Array<Record<string, unknown>> }>();
    expect(listed.map((user) => user.username)).toEqual(['root', 'somchai']);
    expect(listed[0]).toMatchObject({
      username: 'root',
      role: 'admin',
      is_active: true,
      company_id: null,
    });
    expect(listed[1]).toMatchObject({ username: 'somchai', company_id: 'company-1' });
    expect(Object.keys(listed[0] ?? {})).not.toContain('password_hash');
  });

  test('an administrator promotes a Business Development Officer', async () => {
    const officer = users.seed({ username: 'somchai', companyId: 'company-1' });
    const admin = users.seed({ username: 'root', role: 'admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${officer.id}`,
      cookies: session(admin),
      payload: { role: 'admin' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ role: 'admin', company_id: null });
    // The account really moved.
    const stored = await users.findById(officer.id);
    expect(stored?.role).toBe('admin');
    expect(stored?.companyId).toBeNull();
  });

  test('an administrator cannot change their own account', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    users.seed({ username: 'root2', role: 'admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${admin.id}`,
      cookies: session(admin),
      payload: { is_active: false },
    });

    expect(response.statusCode).toBe(403);
  });

  test("the service's last-administrator refusal is surfaced as 409", async () => {
    const lone = users.seed({ username: 'root', role: 'admin' });
    // A second admin who is already deactivated: still holds the role, so a
    // token for them clears `requireAdmin`, but they do not count as active —
    // which leaves `lone` as the only administrator who can still sign in.
    const inactive = users.seed({ username: 'ghost', role: 'admin', isActive: false });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${lone.id}`,
      cookies: session(inactive),
      payload: { role: 'business_development_officer' },
    });

    expect(response.statusCode).toBe(409);
    expect((await users.findById(lone.id))?.role).toBe('admin');
  });

  test('patching an unknown account is a 404', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/nobody',
      cookies: session(admin),
      payload: { is_active: false },
    });

    expect(response.statusCode).toBe(404);
  });
});
