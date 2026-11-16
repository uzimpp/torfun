import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';
import { listRoutes } from './route-inventory';

/**
 * ASVS V8.1.1, V8.2.1, V8.3.1 / threats T-05, T-06 (complete mediation).
 *
 * Instead of trusting that each route file remembered its guard, walk the live
 * routing table: every endpoint that is not on the public list must refuse an
 * anonymous caller, and every administrator endpoint must refuse an officer.
 */

/** Routes a stranger may call. Adding to this list is a security decision. */
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/auth/google',
  'GET /api/auth/google/callback',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
]);

const ADMIN_PREFIXES = ['/api/admin/', '/api/ingestion/', '/api/health/dependencies'];

describe('access control over every route', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let officerCookie: Record<string, string>;
  let adminCookie: Record<string, string>;

  beforeAll(async () => {
    const users = new InMemoryUserStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
    const sign = (u: {
      id: string;
      username: string;
      role: 'admin' | 'business_development_officer';
    }) => ({
      [ACCESS_COOKIE]: app.jwt.sign({ user_id: u.id, username: u.username, role: u.role }),
    });
    officerCookie = sign(users.seed({ username: 'officer' }));
    adminCookie = sign(users.seed({ username: 'root', role: 'admin' }));
  });

  afterAll(async () => {
    await app.close();
  });

  const protectedRoutes = () =>
    // Read lazily: the routing table only exists once the app is ready.
    listRoutes(app).filter((r) => !PUBLIC.has(`${r.method} ${r.url}`));

  test('the inventory sees the whole API', async () => {
    await app.ready();
    expect(listRoutes(app).length).toBeGreaterThan(40);
  });

  test('every non-public route refuses an anonymous caller with 401', async () => {
    await app.ready();
    const open: string[] = [];
    for (const route of protectedRoutes()) {
      const res = await app.inject({
        method: route.method as 'GET',
        url: route.url,
        payload: route.method === 'GET' ? undefined : {},
      });
      if (res.statusCode !== 401) open.push(`${route.method} ${route.url} -> ${res.statusCode}`);
    }
    expect(open).toEqual([]);
  });

  test('every administrator route refuses a Business Development Officer with 403', async () => {
    await app.ready();
    const reachable: string[] = [];
    const adminRoutes = protectedRoutes().filter((r) =>
      ADMIN_PREFIXES.some((p) => r.url.startsWith(p)),
    );
    expect(adminRoutes.length).toBeGreaterThan(15);
    for (const route of adminRoutes) {
      const res = await app.inject({
        method: route.method as 'GET',
        url: route.url,
        cookies: officerCookie,
        payload: route.method === 'GET' ? undefined : {},
      });
      if (res.statusCode !== 403)
        reachable.push(`${route.method} ${route.url} -> ${res.statusCode}`);
    }
    expect(reachable).toEqual([]);
  });

  test('an administrator is let through the same routes (the guard is not a blanket deny)', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/api/admin/users', cookies: adminCookie });
    expect(res.statusCode).toBe(200);
  });

  test('a forged token signed with another secret is rejected', async () => {
    await app.ready();
    const forged = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ user_id: 'x', username: 'root', role: 'admin' }),
    ).toString('base64url');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { [ACCESS_COOKIE]: `${forged}.${body}.bogus-signature` },
    });
    expect(res.statusCode).toBe(401);
  });

  test('alg=none tokens are rejected', async () => {
    await app.ready();
    const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const b = Buffer.from(
      JSON.stringify({ user_id: 'x', username: 'root', role: 'admin' }),
    ).toString('base64url');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      cookies: { [ACCESS_COOKIE]: `${h}.${b}.` },
    });
    expect(res.statusCode).toBe(401);
  });

  test('an expired token is rejected', async () => {
    await app.ready();
    const token = app.jwt.sign(
      { user_id: 'x', username: 'root', role: 'admin' },
      { expiresIn: '-10s' },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [ACCESS_COOKIE]: token },
    });
    expect(res.statusCode).toBe(401);
  });
});
