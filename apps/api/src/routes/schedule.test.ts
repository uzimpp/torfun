import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryScheduleStore } from '../testing/schedule-store';

/**
 * The schedule decides when this system asks a rate-limited upstream for things,
 * so who may change it is a correctness question, not a nicety: administrators
 * only.
 */
describe('schedule routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminCookie: Record<string, string>;
  let officerCookie: Record<string, string>;
  let schedule: InMemoryScheduleStore;

  const daily = {
    enabled: true,
    mode: 'weekly',
    timeOfDay: '02:00',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    everyHours: 24,
  };

  beforeAll(async () => {
    schedule = new InMemoryScheduleStore();
    app = await buildApp(testEnv(), {
      procurements: new InMemoryProcurementStore(),
      ingestionLease: new InMemoryIngestionLease(),
      schedule,
    });
    adminCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60700',
        username: 'site-admin',
        role: 'admin',
      }),
    };
    officerCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60718',
        username: 'bd-officer',
        role: 'business_development_officer',
      }),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (cookies?: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/api/ingestion/schedule', ...(cookies ? { cookies } : {}) });
  const put = (payload: unknown, cookies?: Record<string, string>) =>
    app.inject({
      method: 'PUT',
      url: '/api/ingestion/schedule',
      payload: payload as Record<string, unknown>,
      ...(cookies ? { cookies } : {}),
    });

  test('an anonymous caller is turned away', async () => {
    expect((await get()).statusCode).toBe(401);
    expect((await put(daily)).statusCode).toBe(401);
  });

  test('a Business Development Officer may neither read nor change it', async () => {
    expect((await get(officerCookie)).statusCode).toBe(403);
    expect((await put(daily, officerCookie)).statusCode).toBe(403);
    expect((await schedule.get()).schedule.enabled).toBe(false);
  });

  test('an administrator reads the default: off, nothing scheduled, nothing run', async () => {
    const response = await get(adminCookie);

    expect(response.statusCode).toBe(200);
    expect(response.json() as unknown).toEqual({
      enabled: false,
      mode: 'interval',
      timeOfDay: '02:00',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      everyHours: 24,
      updatedAt: null,
      updatedBy: null,
      lastRunAt: null,
      nextRunAt: null,
      upcomingRunAts: [],
    });
  });

  test('an administrator enables it; it names them and shows when the next run is due', async () => {
    const response = await put(daily, adminCookie);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { enabled: boolean; updatedBy: string; nextRunAt: string };
    expect(body.enabled).toBe(true);
    expect(body.updatedBy).toBe('68b1f0c2a1b2c3d4e5f60700');
    expect(Date.parse(body.nextRunAt)).toBeGreaterThan(Date.now());

    // ...and a fresh read agrees.
    expect(((await get(adminCookie)).json() as { enabled: boolean }).enabled).toBe(true);
  });

  test('enabling it starts no run — the first is the next slot', async () => {
    await put(daily, adminCookie);

    const summary = await app.inject({
      method: 'GET',
      url: '/api/ingestion/summary',
      cookies: adminCookie,
    });
    expect((summary.json() as { runInProgress: boolean }).runInProgress).toBe(false);
    expect((await schedule.get()).lastRunStartedAt).toBeNull();
  });

  test('an interval under six hours is refused', async () => {
    for (const everyHours of [1, 5]) {
      const response = await put({ ...daily, mode: 'interval', everyHours }, adminCookie);
      expect(response.statusCode).toBe(400);
    }
    expect((await put({ ...daily, mode: 'interval', everyHours: 6 }, adminCookie)).statusCode).toBe(
      200,
    );
  });

  test('a malformed body is refused, whatever it tries to say', async () => {
    const bad = [
      { ...daily, timeOfDay: '24:00' },
      { ...daily, timeOfDay: '2:00' },
      { ...daily, mode: '*/5 * * * *' },
      { ...daily, mode: 'daily' },
      { ...daily, weekdays: [] },
      { ...daily, weekdays: [8] },
      { ...daily, everyHours: 7.5 },
      { ...daily, everyHours: 1000 },
      { enabled: true },
      {},
    ];
    for (const payload of bad) {
      expect((await put(payload, adminCookie)).statusCode).toBe(400);
    }
  });

  test('an administrator cannot forge who saved it or when', async () => {
    const response = await put(
      { ...daily, updatedBy: 'someone-else', updatedAt: '2000-01-01T00:00:00.000Z' },
      adminCookie,
    );

    const body = response.json() as { updatedBy: string; updatedAt: string };
    expect(body.updatedBy).toBe('68b1f0c2a1b2c3d4e5f60700');
    expect(body.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });
});
