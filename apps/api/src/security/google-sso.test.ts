import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { UnauthorizedError } from '../core/errors';
import { AuthService } from '../services/auth.service';
import { fetchGoogleProfile } from '../services/google-identity';
import { testEnv } from '../testing/env';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';

/**
 * Criterion 5 (social SSO with OAuth/OpenID). ASVS V10.4.1, V10.4.5, V10.5.2,
 * V6.8.1; threat T-14 (account-linking takeover through Google sign-in).
 */
describe('Google sign-in: which account a Google identity may reach', () => {
  function setup() {
    const users = new InMemoryUserStore();
    const linked: Array<[string, string]> = [];
    users.linkGoogleId = async (id: string, sub: string) => {
      linked.push([id, sub]);
    };
    const service = new AuthService(users, new InMemoryRefreshTokenStore(), () => 'token');
    const victim = users.seed({ username: 'victim', email: 'victim@example.com' });
    return { service, victim, linked };
  }

  test('an unverified Google email is refused and never linked to an existing account', async () => {
    const { service, linked } = setup();
    await expect(
      service.loginWithGoogle({
        sub: 'attacker-sub',
        email: 'victim@example.com',
        email_verified: false,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(linked).toEqual([]);
  });

  test('a profile that does not say the email is verified is refused too', async () => {
    const { service, linked } = setup();
    await expect(
      service.loginWithGoogle({ sub: 'attacker-sub', email: 'victim@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(linked).toEqual([]);
  });

  test('a verified email links once, by Google subject id, and signs in that account', async () => {
    const { service, victim, linked } = setup();
    const session = await service.loginWithGoogle({
      sub: 'real-sub',
      email: 'victim@example.com',
      email_verified: true,
    });
    expect(session.user.id).toBe(victim.id);
    expect(linked).toEqual([[victim.id, 'real-sub']]);
  });

  test('a new Google user is created as a BD officer, never an admin', async () => {
    const { service } = setup();
    const session = await service.loginWithGoogle({
      sub: 'new-sub',
      email: 'new@example.com',
      email_verified: true,
    });
    expect(session.user.role).toBe('business_development_officer');
  });
});

describe('the Google userinfo response is validated, not trusted', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const answer = (body: unknown, status = 200) => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeDefined(); // a hung Google cannot hang sign-in
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
  };

  test.each([
    ['no subject id', { email: 'a@example.com', email_verified: true }],
    ['an email that is not an email', { sub: '1', email: 'not-an-email', email_verified: true }],
    ['a subject id that is an object', { sub: { $ne: '' }, email: 'a@example.com' }],
    ['email_verified as a string', { sub: '1', email: 'a@example.com', email_verified: 'true' }],
  ])('refuses a profile with %s', async (_label, body) => {
    answer(body);
    await expect(fetchGoogleProfile('token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('refuses when Google rejects the token', async () => {
    answer({ error: 'invalid_token' }, 401);
    await expect(fetchGoogleProfile('token')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('accepts a well-formed profile', async () => {
    answer({ sub: '1', email: 'a@example.com', email_verified: true, name: 'A B' });
    expect(await fetchGoogleProfile('token')).toMatchObject({ sub: '1', email_verified: true });
  });
});

describe('the OAuth flow itself', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }));
  });
  afterAll(async () => {
    await app.close();
  });

  test('sign-in starts an authorization-code flow with state and PKCE (S256)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/google' });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.get('scope')).toContain('openid');
  });

  test('a callback with a forged state never signs anyone in', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=stolen-code&state=forged',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.cookies.find((c) => c.name === ACCESS_COOKIE)).toBeUndefined();
    expect(res.headers.location).toBeUndefined();
  });
});
