import { describe, expect, test } from 'bun:test';
import { DEFAULT_SCHEDULE, type Schedule } from '@torfun/types';
import { isDue, nextDueAt, upcomingRuns } from './schedule';

/**
 * Times are written as UTC instants. Asia/Bangkok is UTC+7 with no daylight
 * saving, so a 02:00 Bangkok slot is 19:00 UTC the day before.
 */
const weekly = (overrides: Partial<Schedule> = {}): Schedule => ({
  ...DEFAULT_SCHEDULE,
  enabled: true,
  mode: 'weekly',
  timeOfDay: '02:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  updatedAt: '2026-10-01T05:00:00.000Z', // 12:00 on 1 Oct in Bangkok
  updatedBy: 'admin-1',
  ...overrides,
});

const every = (hours: number, overrides: Partial<Schedule> = {}): Schedule =>
  weekly({ mode: 'interval', everyHours: hours, ...overrides });

describe('a weekly schedule with every day ticked', () => {
  test('never run: waits for the next slot after it was switched on, not immediately', () => {
    const schedule = weekly();

    expect(nextDueAt(schedule, null)).toBe('2026-10-01T19:00:00.000Z');
    expect(isDue(schedule, null, new Date('2026-10-01T05:00:01.000Z'))).toBe(false);
    expect(isDue(schedule, null, new Date('2026-10-01T18:59:59.000Z'))).toBe(false);
    expect(isDue(schedule, null, new Date('2026-10-01T19:00:00.000Z'))).toBe(true);
  });

  test('after a run starts on the slot, the next one is a day later', () => {
    const schedule = weekly();
    const lastRun = '2026-10-01T19:00:30.000Z';

    expect(nextDueAt(schedule, lastRun)).toBe('2026-10-02T19:00:00.000Z');
    expect(isDue(schedule, lastRun, new Date('2026-10-01T19:01:00.000Z'))).toBe(false);
    expect(isDue(schedule, lastRun, new Date('2026-10-02T19:00:00.000Z'))).toBe(true);
  });

  test('a run that started exactly on the slot does not make the same slot due again', () => {
    expect(nextDueAt(weekly(), '2026-10-01T19:00:00.000Z')).toBe('2026-10-02T19:00:00.000Z');
  });

  test('catches up once after downtime, never as a burst', () => {
    const schedule = weekly();
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
    const schedule = weekly({ timeOfDay: '00:30' });
    // 01:00 on 2 Oct in Bangkok — already past that day's 00:30.
    expect(nextDueAt(schedule, '2026-10-01T18:00:00.000Z')).toBe('2026-10-02T17:30:00.000Z');
  });

  test('a late evening slot stays on the same Bangkok day', () => {
    const schedule = weekly({ timeOfDay: '23:59' });
    expect(nextDueAt(schedule, '2026-10-01T05:00:00.000Z')).toBe('2026-10-01T16:59:00.000Z');
  });
});

describe('an interval schedule', () => {
  test('is due that many hours after the last run started', () => {
    const schedule = every(8, { updatedAt: '2026-09-30T00:00:00.000Z' }); // saved before the run
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

describe('a schedule saved after the last run', () => {
  // Left off for days, then switched on (or given a new time): every save
  // stamps updatedAt, and that later moment is what the next run counts from.
  const longAgo = '2026-09-20T19:00:00.000Z';

  test('weekly: switching it on again starts nothing, the first run is the next slot', () => {
    const schedule = weekly(); // saved 12:00 on 1 Oct in Bangkok

    expect(isDue(schedule, longAgo, new Date('2026-10-01T05:00:01.000Z'))).toBe(false);
    expect(nextDueAt(schedule, longAgo)).toBe('2026-10-01T19:00:00.000Z');
  });

  test('interval: a new interval counts from the save, not from a run days ago', () => {
    const schedule = every(6); // saved 05:00 UTC

    expect(isDue(schedule, longAgo, new Date('2026-10-01T05:00:01.000Z'))).toBe(false);
    expect(nextDueAt(schedule, longAgo)).toBe('2026-10-01T11:00:00.000Z');
  });

  test('a run that started after the save still decides the next one', () => {
    const schedule = every(6);

    expect(nextDueAt(schedule, '2026-10-01T08:00:00.000Z')).toBe('2026-10-01T14:00:00.000Z');
  });
});

describe('a schedule that is off or was never configured', () => {
  test('a disabled schedule has no next run and is never due', () => {
    const schedule = weekly({ enabled: false });

    expect(nextDueAt(schedule, null)).toBeNull();
    expect(nextDueAt(schedule, '2026-10-01T00:00:00.000Z')).toBeNull();
    expect(isDue(schedule, null, new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
  });

  test('an enabled schedule with nothing to count from has no next run', () => {
    // Should not happen — enabling stamps updatedAt — but a hand-edited document
    // must not start a run on the strength of a missing date.
    const schedule = weekly({ updatedAt: null });

    expect(nextDueAt(schedule, null)).toBeNull();
    expect(isDue(schedule, null, new Date('2027-01-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('a weekly schedule on chosen days', () => {
  // 1 Oct 2026 is a Thursday in Bangkok; the schedule was saved at 12:00 that day.
  const mondaysAndWednesdays = weekly({ weekdays: [1, 3] });

  test('waits for the next chosen day, skipping the days in between', () => {
    // Fri, Sat, Sun pass; Monday 5 Oct 02:00 Bangkok is 19:00 UTC on the 4th.
    expect(nextDueAt(mondaysAndWednesdays, null)).toBe('2026-10-04T19:00:00.000Z');
  });

  test('after a run on one chosen day, the next is the following chosen day', () => {
    expect(nextDueAt(mondaysAndWednesdays, '2026-10-04T19:00:10.000Z')).toBe(
      '2026-10-06T19:00:00.000Z', // Wednesday 7 Oct 02:00 Bangkok
    );
  });

  test('a day is the Bangkok day: a 00:30 slot on Monday falls on Sunday in UTC', () => {
    const schedule = weekly({ weekdays: [1], timeOfDay: '00:30' });

    expect(nextDueAt(schedule, null)).toBe('2026-10-04T17:30:00.000Z');
  });

  test('one chosen day is weekly: a week after the last run on it', () => {
    const schedule = weekly({ weekdays: [1] });

    expect(nextDueAt(schedule, '2026-10-04T19:00:00.000Z')).toBe('2026-10-11T19:00:00.000Z');
  });

  test('catches up once after downtime, however many chosen days were missed', () => {
    const backUp = new Date('2026-10-20T05:00:00.000Z');

    expect(isDue(mondaysAndWednesdays, '2026-10-04T19:00:00.000Z', backUp)).toBe(true);
    expect(isDue(mondaysAndWednesdays, backUp.toISOString(), backUp)).toBe(false);
  });
});

describe('the next few runs', () => {
  test('on an interval, one every N hours from the first', () => {
    const schedule = every(8, { updatedAt: '2026-09-30T00:00:00.000Z' });

    expect(upcomingRuns(schedule, '2026-10-01T00:00:00.000Z', 3)).toEqual([
      '2026-10-01T08:00:00.000Z',
      '2026-10-01T16:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
    ]);
  });

  test('on chosen weekdays, each at the next chosen day after the one before', () => {
    expect(upcomingRuns(weekly({ weekdays: [1, 3] }), null, 3)).toEqual([
      '2026-10-04T19:00:00.000Z', // Mon 5 Oct 02:00 Bangkok
      '2026-10-06T19:00:00.000Z', // Wed 7 Oct
      '2026-10-11T19:00:00.000Z', // Mon 12 Oct
    ]);
  });

  test('is empty when the schedule is off or has nothing to count from', () => {
    expect(upcomingRuns(weekly({ enabled: false }), null, 3)).toEqual([]);
    expect(upcomingRuns(weekly({ updatedAt: null }), null, 3)).toEqual([]);
  });
});
