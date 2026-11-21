import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import bcrypt from 'bcryptjs';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { GOOD_PASSWORD, WRONG_PASSWORD } from '../testing/passwords';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';

/**
 * ASVS V6.3.8 / threat T-01. Found by the black-box run (docs/security/pentest,
 * attack A3b): the body was already identical for an unknown username and a
 * wrong password, but the unknown one came back in ~1 ms and the real one in
 * ~250 ms, because only the real one reached bcrypt. Timing was the oracle.
 */
describe('sign-in does not reveal which usernames exist', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  const login = (username: string, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: ip,
      payload: { username, password: WRONG_PASSWORD },
    });

  beforeAll(async () => {
    const users = new InMemoryUserStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
    await users.create({
      username: 'somchai',
      firstName: 'Somchai',
      lastName: 'Prasert',
      role: 'business_development_officer',
      passwordHash: await bcrypt.hash(GOOD_PASSWORD, 12),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  test('an unknown username still pays for one bcrypt comparison', async () => {
    const compare = spyOn(bcrypt, 'compare');
    try {
      const res = await login('nobody-here', '10.0.0.1');
      expect(res.statusCode).toBe(401);
      expect(compare).toHaveBeenCalledTimes(1);
    } finally {
      compare.mockRestore();
    }
  });

  test('unknown and existing usernames get the same answer in comparable time', async () => {
    await login('warm-up', '10.0.0.2'); // the decoy hash is built on the first miss
    const time = async (username: string, ip: string) => {
      const start = performance.now();
      const res = await login(username, ip);
      return { ms: performance.now() - start, status: res.statusCode, body: res.json() };
    };
    const unknown = await time('nobody-else', '10.0.0.3');
    const known = await time('somchai', '10.0.0.4');

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    // Same bcrypt cost on both paths; a generous bound keeps this steady on
    // a loaded CI runner while still catching the 1 ms vs 250 ms gap.
    expect(unknown.ms).toBeGreaterThan(known.ms * 0.4);
  });
});
