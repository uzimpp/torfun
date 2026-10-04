import { describe, expect, test } from 'bun:test';
import {
  ALL_WEEKDAYS,
  DEFAULT_SCHEDULE,
  MIN_INTERVAL_HOURS,
  ScheduleSchema,
  ScheduleUpdateSchema,
  ScheduleViewSchema,
} from './schedule';

const update = {
  enabled: true,
  mode: 'weekly',
  timeOfDay: '02:00',
  weekdays: [1, 3, 5],
  everyHours: 24,
} as const;

describe('ScheduleUpdateSchema', () => {
  test('accepts weekdays at a time of day, or an interval of at least six hours', () => {
    expect(ScheduleUpdateSchema.safeParse(update).success).toBe(true);
    expect(
      ScheduleUpdateSchema.safeParse({ ...update, mode: 'interval', everyHours: 6 }).success,
    ).toBe(true);
  });

  test('has exactly two modes: "daily" is weekly with every day ticked, or every 24 hours', () => {
    expect(ScheduleUpdateSchema.safeParse({ ...update, mode: 'daily' }).success).toBe(false);
  });

  test('rejects an interval shorter than six hours, because it decides upstream load', () => {
    expect(MIN_INTERVAL_HOURS).toBe(6);
    for (const everyHours of [0, 1, 5]) {
      const parsed = ScheduleUpdateSchema.safeParse({ ...update, mode: 'interval', everyHours });
      expect(parsed.success).toBe(false);
    }
  });

  test('rejects fractional or absurd intervals', () => {
    expect(ScheduleUpdateSchema.safeParse({ ...update, everyHours: 7.5 }).success).toBe(false);
    expect(ScheduleUpdateSchema.safeParse({ ...update, everyHours: 169 }).success).toBe(false);
  });

  test('rejects a time of day that is not HH:MM on a real clock', () => {
    for (const timeOfDay of ['2:00', '24:00', '12:60', 'noon', '02:00:00', '']) {
      expect(ScheduleUpdateSchema.safeParse({ ...update, timeOfDay }).success).toBe(false);
    }
    expect(ScheduleUpdateSchema.safeParse({ ...update, timeOfDay: '23:59' }).success).toBe(true);
  });

  test('rejects an unknown mode, so a cron string cannot slip in', () => {
    expect(ScheduleUpdateSchema.safeParse({ ...update, mode: '*/5 * * * *' }).success).toBe(false);
  });

  test('needs at least one weekday, each a real day, none twice', () => {
    expect(ScheduleUpdateSchema.safeParse({ ...update, weekdays: [] }).success).toBe(false);
    expect(ScheduleUpdateSchema.safeParse({ ...update, weekdays: [7] }).success).toBe(false);
    expect(ScheduleUpdateSchema.safeParse({ ...update, weekdays: [-1] }).success).toBe(false);
    expect(ScheduleUpdateSchema.safeParse({ ...update, weekdays: [1, 1] }).success).toBe(false);
    expect(ScheduleUpdateSchema.safeParse({ ...update, weekdays: ALL_WEEKDAYS }).success).toBe(
      true,
    );
  });
});

describe('DEFAULT_SCHEDULE', () => {
  test('is off, with every 24 hours ready for an administrator to enable', () => {
    expect(DEFAULT_SCHEDULE).toEqual({
      enabled: false,
      mode: 'interval',
      timeOfDay: '02:00',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      everyHours: 24,
      updatedAt: null,
      updatedBy: null,
    });
    expect(ScheduleSchema.safeParse(DEFAULT_SCHEDULE).success).toBe(true);
  });
});

describe('ScheduleViewSchema', () => {
  const view = {
    ...DEFAULT_SCHEDULE,
    lastRunAt: null,
    nextRunAt: null,
    upcomingRunAts: [],
  };

  test('adds the last and next run times, both nullable', () => {
    expect(ScheduleViewSchema.safeParse(view).success).toBe(true);
    expect(
      ScheduleViewSchema.safeParse({ ...view, nextRunAt: '2026-10-01T19:00:00.000Z' }).success,
    ).toBe(true);
  });

  test('carries the next few runs', () => {
    const parsed = ScheduleViewSchema.parse({
      ...view,
      upcomingRunAts: ['2026-10-01T19:00:00.000Z', '2026-10-02T19:00:00.000Z'],
    });

    expect(parsed.upcomingRunAts).toHaveLength(2);
  });
});
