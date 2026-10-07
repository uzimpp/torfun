import { describe, expect, test } from 'bun:test';
import { convertDateToISO } from './dates';

describe('convertDateToISO', () => {
  test('reads the upstream Thai display date with a two-digit Buddhist-era year', () => {
    expect(convertDateToISO('26 มิ.ย. 69')).toBe('2026-06-26T00:00:00.000Z');
    expect(convertDateToISO('14 ก.พ. 67')).toBe('2024-02-14T00:00:00.000Z');
    expect(convertDateToISO('8 ก.ย. 68')).toBe('2025-09-08T00:00:00.000Z');
  });

  test('reads every abbreviated Thai month', () => {
    const months = [
      'ม.ค.',
      'ก.พ.',
      'มี.ค.',
      'เม.ย.',
      'พ.ค.',
      'มิ.ย.',
      'ก.ค.',
      'ส.ค.',
      'ก.ย.',
      'ต.ค.',
      'พ.ย.',
      'ธ.ค.',
    ];
    months.forEach((month, index) => {
      const expected = `2026-${String(index + 1).padStart(2, '0')}-01T00:00:00.000Z`;
      expect(convertDateToISO(`1 ${month} 69`)).toBe(expected);
    });
  });

  test('reads full Thai month names and four-digit Buddhist years', () => {
    expect(convertDateToISO('1 ตุลาคม 2569')).toBe('2026-10-01T00:00:00.000Z');
    expect(convertDateToISO('30 ตุลาคม 2569')).toBe('2026-10-30T00:00:00.000Z');
  });

  test('turns an ISO date into midnight UTC, converting a Buddhist-era year', () => {
    expect(convertDateToISO('2026-10-15')).toBe('2026-10-15T00:00:00.000Z');
    expect(convertDateToISO('2569-10-15')).toBe('2026-10-15T00:00:00.000Z');
  });

  test('keeps the time of a timestamp, as a UTC instant', () => {
    expect(convertDateToISO('2026-10-15T16:30:00+07:00')).toBe('2026-10-15T09:30:00.000Z');
    expect(convertDateToISO('2026-10-15T16:30:00Z')).toBe('2026-10-15T16:30:00.000Z');
    expect(convertDateToISO('2026-10-15T16:30:00+0700')).toBe('2026-10-15T09:30:00.000Z');
  });

  test('reads a timestamp with no offset as Thailand time', () => {
    expect(convertDateToISO('2026-10-15T16:30:00')).toBe('2026-10-15T09:30:00.000Z');
    expect(convertDateToISO('2026-10-15 16:30')).toBe('2026-10-15T09:30:00.000Z');
  });

  test('is idempotent on its own output', () => {
    const once = convertDateToISO('26 มิ.ย. 69');
    expect(convertDateToISO(once)).toBe(once!);
  });

  test('is null for a placeholder, an empty value, or anything it cannot read', () => {
    expect(convertDateToISO('-')).toBeNull();
    expect(convertDateToISO('')).toBeNull();
    expect(convertDateToISO(null)).toBeNull();
    expect(convertDateToISO(undefined)).toBeNull();
    expect(convertDateToISO('not-a-date')).toBeNull();
    expect(convertDateToISO('ภายใน 30 วัน')).toBeNull();
  });

  test('is null for a day or time that does not exist', () => {
    expect(convertDateToISO('31 ก.พ. 69')).toBeNull();
    expect(convertDateToISO('2026-02-30')).toBeNull();
    expect(convertDateToISO('2026-10-15T25:00:00Z')).toBeNull();
  });
});
