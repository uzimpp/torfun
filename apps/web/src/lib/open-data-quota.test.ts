import { describe, expect, test } from 'vitest';
import { describeQuota, quotaFigure, quotaIsLow, todaysQuota } from './open-data-quota';

const reading = (remainingDay: number, observedAt: string, limitDay: number | null = 1000) => ({
  remainingDay,
  limitDay,
  observedAt,
});

// 10:00 in Bangkok on 30 September.
const NOW = new Date('2026-09-30T03:00:00.000Z');
const today = (remainingDay: number, limitDay: number | null = 1000) =>
  reading(remainingDay, '2026-09-30T01:00:00.000Z', limitDay);

describe('todaysQuota', () => {
  test('a reading from earlier the same Bangkok day is current', () => {
    expect(todaysQuota(today(450), NOW)).toEqual(today(450));
  });

  test('a reading from the Bangkok day before is not, nor is none or an unreadable time', () => {
    expect(todaysQuota(reading(0, '2026-09-29T10:00:00.000Z'), NOW)).toBeNull();
    expect(todaysQuota(null, NOW)).toBeNull();
    expect(todaysQuota(reading(0, 'not a date'), NOW)).toBeNull();
  });

  // Bangkok is UTC+7: from 00:00 to 07:00 there, the UTC date is still yesterday's.
  test('just after midnight in Bangkok, a reading from late the evening before is stale', () => {
    const lateEvening = reading(0, '2026-09-30T16:30:00.000Z'); // 23:30 on 30 Sep, Bangkok
    const pastMidnight = new Date('2026-09-30T17:30:00.000Z'); // 00:30 on 1 Oct, Bangkok
    expect(todaysQuota(lateEvening, pastMidnight)).toBeNull();
  });

  test('before 07:00 in Bangkok, a reading from after midnight there is current', () => {
    const afterMidnight = reading(900, '2026-09-30T17:10:00.000Z'); // 00:10 on 1 Oct, Bangkok
    const early = new Date('2026-09-30T23:00:00.000Z'); // 06:00 on 1 Oct, Bangkok
    expect(todaysQuota(afterMidnight, early)).toEqual(afterMidnight);

    const later = new Date('2026-10-01T01:00:00.000Z'); // 08:00 on 1 Oct, Bangkok
    expect(todaysQuota(afterMidnight, later)).toEqual(afterMidnight);
  });
});

describe('quotaIsLow', () => {
  test('low when what is left today would not cover a full sweep', () => {
    expect(quotaIsLow(today(120), NOW)).toBe(true);
    expect(quotaIsLow(today(600), NOW)).toBe(false);
  });

  test('a stale reading says nothing about today', () => {
    expect(quotaIsLow(reading(0, '2026-09-29T10:00:00.000Z'), NOW)).toBe(false);
  });
});

describe('quotaFigure', () => {
  test('what is left over the limit, or just what is left when the limit is unknown', () => {
    expect(quotaFigure(today(450))).toBe('450/1,000');
    expect(quotaFigure(today(1200, null))).toBe('เหลือ 1,200');
  });
});

describe('describeQuota', () => {
  test('says nothing is known before a sweep has read it', () => {
    expect(describeQuota(null, NOW)).toEqual({ label: 'โควตา open-data: ยังไม่ทราบ', low: false });
  });

  test('shows what is left of the day, without alarm, while a full sweep is affordable', () => {
    expect(describeQuota(today(640), NOW)).toEqual({
      label: 'โควตา open-data วันนี้เหลือ 640/1,000',
      low: false,
    });
  });

  test('warns when what is left cannot cover a full sweep, and says plainly when it is gone', () => {
    const short = describeQuota(today(120), NOW);
    expect(short.low).toBe(true);
    expect(short.label).toMatch(/120\/1,000 — ไม่พอ/);

    const gone = describeQuota(today(0), NOW);
    expect(gone.low).toBe(true);
    expect(gone.label).toMatch(/หมดแล้ว/);
  });

  test('a reading from an earlier Bangkok day is unknown, not a stale zero', () => {
    expect(describeQuota(reading(0, '2026-09-29T15:00:00.000Z'), NOW)).toEqual({
      label: 'โควตา open-data: ยังไม่ทราบ',
      low: false,
    });
  });
});
