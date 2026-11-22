import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { InMemoryIngestionRunStore, noStats } from '../testing/ingestion-run-store';

/**
 * Advanced feature: rate limiting for backend APIs (issue #168, ASVS V2.4.1,
 * V15.2.2, threat T-13). Expensive routes get a tighter budget than the global
 * 100/min, and the budget answers 429 with a Retry-After.
 */
describe('expensive route limits', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let admin: Record<string, string>;
  let officer: Record<string, string>;

  beforeAll(async () => {
    const users = new InMemoryUserStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      refreshTokens: new InMemoryRefreshTokenStore(),
      procurements: new InMemoryProcurementStore(),
      ingestionLease: new InMemoryIngestionLease(),
      ingestionRuns: new InMemoryIngestionRunStore(),
      ingestionStats: noStats,
    });
    // Never reach the real upstream from a test: only the route's budget is under test.
    spyOn(app.ingestionService, 'startRun').mockResolvedValue(undefined as never);
    const cookie = (u: {
      id: string;
      username: string;
      role: 'admin' | 'business_development_officer';
    }) => ({
      [ACCESS_COOKIE]: app.jwt.sign({ user_id: u.id, username: u.username, role: u.role }),
    });
    admin = cookie(users.seed({ username: 'root', role: 'admin' }));
    officer = cookie(users.seed({ username: 'officer' }));
  });
  afterAll(async () => {
    await app.close();
  });

  test('starting an ingestion Run is capped at 5 per 15 minutes', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingestion/run',
        cookies: admin,
        payload: {},
      });
      codes.push(res.statusCode);
      if (res.statusCode === 429) expect(res.headers['retry-after']).toBeDefined();
    }
    expect(codes.slice(0, 5).every((c) => c !== 429)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  test('a limited admin route still refuses an officer before spending budget', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ingestion/run',
      cookies: officer,
      payload: {},
    });
    // Either 403 (guard first) or 429 (budget already spent by the test above):
    // never 202. The officer must not be able to start a Run.
    expect([403, 429]).toContain(res.statusCode);
  });

  test('submitting TOR reports is capped at 10 per 15 minutes', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tors/p-1/reports',
        cookies: officer,
        payload: {},
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 10).includes(429)).toBe(false);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});
