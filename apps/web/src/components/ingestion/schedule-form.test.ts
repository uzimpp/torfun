import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULE, type ScheduleView } from '@torfun/types';
import {
  INTERVAL_PRESETS,
  WEEKDAY_LABELS,
  formatBangkok,
  isPreset,
  toFormValues,
  toUpdate,
  validateSchedule,
  type ScheduleFormValues,
} from './schedule-form';

const weekly: ScheduleFormValues = {
  enabled: true,
  mode: 'weekly',
  timeOfDay: '02:00',
  weekdays: [1, 3, 5],
  everyHours: 24,
};

describe('validateSchedule', () => {
  test('chosen weekdays at a time of day, and a standard interval, are fine', () => {
    expect(validateSchedule(weekly)).toEqual({});
    expect(validateSchedule({ ...weekly, mode: 'interval', everyHours: 6 })).toEqual({});
  });

  test('a missing or malformed time of day is refused in Thai, only in weekly mode', () => {
    for (const timeOfDay of ['', '2:00', '24:00', '12:60', 'noon']) {
      expect(validateSchedule({ ...weekly, timeOfDay }).timeOfDay).toMatch(/[฀-๿]/);
    }
    // Hidden in interval mode, so it cannot block a save the person can't see a reason for.
    expect(validateSchedule({ ...weekly, mode: 'interval', timeOfDay: '' })).toEqual({});
  });

  test('weekly with no day ticked is refused in Thai, beside the days', () => {
    expect(validateSchedule({ ...weekly, weekdays: [] }).weekdays).toMatch(/[฀-๿]/);
    expect(validateSchedule({ ...weekly, mode: 'interval', weekdays: [] })).toEqual({});
  });

  test('an interval under six hours, or past a week, or fractional, is refused in Thai', () => {
    for (const everyHours of [0, 1, 5, 169, 7.5, Number.NaN]) {
      const errors = validateSchedule({ ...weekly, mode: 'interval', everyHours });
      expect(errors.everyHours).toMatch(/[฀-๿]/);
    }
  });

  test('the interval is not checked in weekly mode', () => {
    expect(validateSchedule({ ...weekly, everyHours: 1 })).toEqual({});
  });
});

describe('toUpdate', () => {
  test('sends the five fields the API accepts, and nothing else', () => {
    expect(toUpdate(weekly)).toEqual({
      enabled: true,
      mode: 'weekly',
      timeOfDay: '02:00',
      weekdays: [1, 3, 5],
      everyHours: 24,
    });
  });

  test('sends the days in week order whatever order they were ticked in', () => {
    expect(toUpdate({ ...weekly, weekdays: [5, 1, 3] }).weekdays).toEqual([1, 3, 5]);
  });

  test('in interval mode an unusable hidden time or day list falls back to the defaults', () => {
    // The API validates every field whatever the mode, so a blank one must not go up.
    const update = toUpdate({ ...weekly, mode: 'interval', timeOfDay: '', weekdays: [] });

    expect(update.timeOfDay).toBe('02:00');
    expect(update.weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('toFormValues', () => {
  test('starts the form from what is stored', () => {
    const view: ScheduleView = {
      ...DEFAULT_SCHEDULE,
      enabled: true,
      mode: 'weekly',
      timeOfDay: '03:30',
      weekdays: [2, 4],
      everyHours: 12,
      lastRunAt: null,
      nextRunAt: null,
      upcomingRunAts: [],
    };
    expect(toFormValues(view)).toEqual({
      enabled: true,
      mode: 'weekly',
      timeOfDay: '03:30',
      weekdays: [2, 4],
      everyHours: 12,
    });
  });
});

describe('the interval presets', () => {
  test('are a day, two, three and a week, with a custom value beside them', () => {
    expect([...INTERVAL_PRESETS]).toEqual([24, 48, 72, 168]);
    expect(isPreset(72)).toBe(true);
    expect(isPreset(36)).toBe(false);
  });
});

describe('WEEKDAY_LABELS', () => {
  test('names the seven days in Thai, Sunday first, matching the stored numbers', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7);
    expect(WEEKDAY_LABELS[0]).toBe('อาทิตย์');
    expect(WEEKDAY_LABELS[1]).toBe('จันทร์');
    expect(new Set(WEEKDAY_LABELS).size).toBe(7);
  });
});

describe('formatBangkok', () => {
  test('writes an instant as Bangkok time in Thai, whatever the machine zone', () => {
    // 19:00 UTC is 02:00 the next day in Bangkok.
    const text = formatBangkok('2026-10-01T19:00:00.000Z');
    expect(text).toMatch(/[฀-๿]/);
    expect(text).toContain('02:00');
  });

  test('says so plainly when there is nothing to show', () => {
    expect(formatBangkok(null)).toBe('—');
  });
});
