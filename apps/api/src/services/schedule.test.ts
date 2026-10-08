import { describe, expect, test } from 'bun:test';
import { DEFAULT_SCHEDULE, type Schedule } from '@torfun/types';
import { isDue, nextDueAt } from './schedule';

/**
 * Times are written as UTC instants. Asia/Bangkok is UTC+7 with no daylight
 * saving, so a 02:00 Bangkok slot is 19:00 UTC the day before.
 */
const daily = (overrides: Partial<Schedule> = {}): Schedule => ({
  ...DEFAULT_SCHEDULE,
  enabled: true,
  mode: 'daily',
  timeOfDay: '02:00',
  updatedAt: '2026-10-01T05:00:00.000Z', // 12:00 on 1 Oct in Bangkok
  updatedBy: 'admin-1',
  ...overrides,
});

const every = (hours: number, overrides: Partial<Schedule> = {}): Schedule =>
  daily({ mode: 'interval', everyHours: hours, ...overrides });

describe('a daily schedule', () => {
  test('never run: waits for the next slot after it was switched on, not immediately', () => {
    const schedule = daily();

    expect(nextDueAt(schedule, null)).toBe('2026-10-01T19:00:00.000Z');
    expect(isDue(schedule, null, new Date('2026-10-01T05:00:01.000Z'))).toBe(false);
    expect(isDue(schedule, null, new Date('2026-10-01T18:59:59.000Z'))).toBe(false);
    expect(isDue(schedule, null, new Date('2026-10-01T19:00:00.000Z'))).toBe(true);
  });

  test('after a run starts on the slot, the next one is a day later', () => {
    const schedule = daily();
    const lastRun = '2026-10-01T19:00:30.000Z';

    expect(nextDueAt(schedule, lastRun)).toBe('2026-10-02T19:00:00.000Z');
    expect(isDue(schedule, lastRun, new Date('2026-10-01T19:01:00.000Z'))).toBe(false);
    expect(isDue(schedule, lastRun, new Date('2026-10-02T19:00:00.000Z'))).toBe(true);
  });

  test('a run that started exactly on the slot does not make the same slot due again', () => {
    expect(nextDueAt(daily(), '2026-10-01T19:00:00.000Z')).toBe('2026-10-02T19:00:00.000Z');
  });

  test('catches up once after downtime, never as a burst', () => {
    const schedule = daily();
    const lastRun = '2026-10-01T19:00:00.000Z';
    const backUp = new Date('2026-10-04T05:00:00.000Z'); // three slots missed

    expect(isDue(schedule, lastRun, backUp)).toBe(true);

    // The catch-up run starts now, and that is what the next slot is measured from.
    const afterCatchUp = backUp.toISOString();
    expect(isDue(schedule, afterCatchUp, backUp)).toBe(false);
    expect(nextDueAt(schedule, afterCatchUp)).toBe('2026-10-04T19:00:00.000Z');
  });

  test('reads the time of day in Bangkok across the UTC date line', () => {
    // 00:30 in Bangkok is 17:30 UTC the day before.
    const schedule = daily({ timeOfDay: '00:30' });
    // 01:00 on 2 Oct in Bangkok — already past that day's 00:30.
    expect(nextDueAt(schedule, '2026-10-01T18:00:00.000Z')).toBe('2026-10-02T17:30:00.000Z');
  });

  test('a late evening slot stays on the same Bangkok day', () => {
    const schedule = daily({ timeOfDay: '23:59' });
    expect(nextDueAt(schedule, '2026-10-01T05:00:00.000Z')).toBe('2026-10-01T16:59:00.000Z');
  });
});

describe('an interval schedule', () => {
  test('is due that many hours after the last run started', () => {
    const schedule = every(8);
    const lastRun = '2026-10-01T00:00:00.000Z';

    expect(nextDueAt(schedule, lastRun)).toBe('2026-10-01T08:00:00.000Z');
    expect(isDue(schedule, lastRun, new Date('2026-10-01T07:59:59.000Z'))).toBe(false);
    expect(isDue(schedule, lastRun, new Date('2026-10-01T08:00:00.000Z'))).toBe(true);
  });

  test('never run: counts from when it was switched on, so switching on starts no run', () => {
    const schedule = every(12);

    expect(nextDueAt(schedule, null)).toBe('2026-10-01T17:00:00.000Z');
    expect(isDue(schedule, null, new Date('2026-10-01T05:00:01.000Z'))).toBe(false);
  });

  test('runs once after downtime, however many intervals were missed', () => {
    const schedule = every(6);
    const backUp = new Date('2026-10-05T00:00:00.000Z');

    expect(isDue(schedule, '2026-10-01T00:00:00.000Z', backUp)).toBe(true);
    expect(isDue(schedule, backUp.toISOString(), backUp)).toBe(false);
  });
});

describe('a schedule that is off or was never configured', () => {
  test('a disabled schedule has no next run and is never due', () => {
    const schedule = daily({ enabled: false });

    expect(nextDueAt(schedule, null)).toBeNull();
    expect(nextDueAt(schedule, '2026-10-01T00:00:00.000Z')).toBeNull();
    expect(isDue(schedule, null, new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
  });

  test('an enabled schedule with nothing to count from has no next run', () => {
    // Should not happen — enabling stamps updatedAt — but a hand-edited document
    // must not start a run on the strength of a missing date.
    const schedule = daily({ updatedAt: null });

    expect(nextDueAt(schedule, null)).toBeNull();
    expect(isDue(schedule, null, new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
  });
});
