import { describe, expect, test } from 'vitest';
import { DEFAULT_SCHEDULE, type ScheduleView } from '@torfun/types';
import {
  HOUR_CHOICES,
  formatBangkok,
  hourChoicesFor,
  toFormValues,
  toUpdate,
  validateSchedule,
  type ScheduleFormValues,
} from './schedule-form';

const daily: ScheduleFormValues = {
  enabled: true,
  mode: 'daily',
  timeOfDay: '02:00',
  everyHours: 24,
};

describe('validateSchedule', () => {
  test('a daily time of day and a standard interval are fine', () => {
    expect(validateSchedule(daily)).toEqual({});
    expect(validateSchedule({ ...daily, mode: 'interval', everyHours: 6 })).toEqual({});
  });

  test('a missing or malformed time of day is refused in Thai, only in daily mode', () => {
    for (const timeOfDay of ['', '2:00', '24:00', '12:60', 'noon']) {
      expect(validateSchedule({ ...daily, timeOfDay }).timeOfDay).toMatch(/[฀-๿]/);
    }
    // Hidden in interval mode, so it cannot block a save the person can't see a reason for.
    expect(validateSchedule({ ...daily, mode: 'interval', timeOfDay: '' })).toEqual({});
  });

  test('an interval under six hours, or past a week, or fractional, is refused in Thai', () => {
    for (const everyHours of [0, 1, 5, 169, 7.5, Number.NaN]) {
      const errors = validateSchedule({ ...daily, mode: 'interval', everyHours });
      expect(errors.everyHours).toMatch(/[฀-๿]/);
    }
  });

  test('the interval is not checked in daily mode', () => {
    expect(validateSchedule({ ...daily, everyHours: 1 })).toEqual({});
  });
});

describe('toUpdate', () => {
  test('sends the four fields the API accepts, and nothing else', () => {
    expect(toUpdate(daily)).toEqual({
      enabled: true,
      mode: 'daily',
      timeOfDay: '02:00',
      everyHours: 24,
    });
  });

  test('in interval mode an unusable hidden time falls back to the default preset', () => {
    // The API validates every field whatever the mode, so a blank one must not go up.
    expect(toUpdate({ ...daily, mode: 'interval', timeOfDay: '' }).timeOfDay).toBe('02:00');
  });
});

describe('toFormValues', () => {
  test('starts the form from what is stored', () => {
    const view: ScheduleView = {
      ...DEFAULT_SCHEDULE,
      enabled: true,
      mode: 'interval',
      timeOfDay: '03:30',
      everyHours: 12,
      lastRunAt: null,
      nextRunAt: null,
    };
    expect(toFormValues(view)).toEqual({
      enabled: true,
      mode: 'interval',
      timeOfDay: '03:30',
      everyHours: 12,
    });
  });
});

describe('hourChoicesFor', () => {
  test('offers 6, 8, 12, 24 and 48 hours', () => {
    expect([...HOUR_CHOICES]).toEqual([6, 8, 12, 24, 48]);
    expect(hourChoicesFor(24)).toEqual([6, 8, 12, 24, 48]);
  });

  test('keeps an already-stored value the list does not offer, so it is not silently changed', () => {
    expect(hourChoicesFor(36)).toEqual([6, 8, 12, 24, 36, 48]);
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
