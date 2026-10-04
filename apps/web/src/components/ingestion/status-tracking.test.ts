import { describe, expect, test } from 'vitest';
import { MAX_RETRIEVAL_ATTEMPTS } from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';
import {
  attemptsLabel,
  describeChange,
  describeQuota,
  formatElapsed,
  runBanner,
  stageDuration,
} from './status-tracking';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const processing = (lastChangeMinutesAgo: number) => ({
  state: 'Processing' as const,
  updatedAt: minutesAgo(0),
  statusHistory: [
    { state: 'Queued' as const, outcome: 'queued' as const, at: minutesAgo(600) },
    {
      state: 'Processing' as const,
      outcome: 'analysing' as const,
      at: minutesAgo(lastChangeMinutesAgo),
    },
  ],
});

describe('stageDuration', () => {
  test('is how long a Processing record has been in its current stage', () => {
    expect(stageDuration(processing(3), NOW)).toEqual({
      label: 'อยู่ในขั้นนี้ 3 นาที',
      overdue: false,
    });
  });

  test('measures from the last change, not from when the record was discovered', () => {
    expect(stageDuration(processing(90), NOW)?.label).toBe('อยู่ในขั้นนี้ 1 ชั่วโมง 30 นาที');
  });

  test('is overdue past five minutes, and not before', () => {
    expect(stageDuration(processing(5), NOW)?.overdue).toBe(false);
    expect(stageDuration(processing(6), NOW)?.overdue).toBe(true);
  });

  test('says under a minute rather than 0 minutes', () => {
    expect(stageDuration(processing(0), NOW)?.label).toBe('อยู่ในขั้นนี้ไม่ถึง 1 นาที');
  });

  test('is null for a record that is not being processed', () => {
    expect(stageDuration({ ...processing(3), state: 'Completed' }, NOW)).toBeNull();
    expect(stageDuration({ ...processing(3), state: 'Queued' }, NOW)).toBeNull();
  });

  test('falls back to updatedAt when the history is empty', () => {
    expect(
      stageDuration({ state: 'Processing', statusHistory: [], updatedAt: minutesAgo(8) }, NOW),
    ).toEqual({ label: 'อยู่ในขั้นนี้ 8 นาที', overdue: true });
  });
});

describe('attemptsLabel', () => {
  test('is absent until a retrieval has actually been tried', () => {
    expect(attemptsLabel(0)).toBeNull();
  });

  test('counts tries against the limit the pipeline enforces', () => {
    expect(MAX_RETRIEVAL_ATTEMPTS).toBe(3);
    expect(attemptsLabel(1)).toBe('ลองแล้ว 1/3');
    expect(attemptsLabel(3)).toBe('ลองแล้ว 3/3');
  });
});

describe('runBanner', () => {
  const summary = (overrides: Partial<IngestionSummaryResponse>): IngestionSummaryResponse => ({
    total: 288,
    byState: {},
    byOutcome: {},
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 0,
    totalTorBytes: 0,
    failureCount: 0,
    lastRunAt: null,
    openDataQuota: null,
    runInProgress: true,
    runStartedAt: null,
    stopRequested: false,
    agencies: [],
    ...overrides,
  });

  test('is null while no run is in flight', () => {
    expect(runBanner(summary({ runInProgress: false }), NOW)).toBeNull();
  });

  test('says which stage the work is in and how much is left', () => {
    const banner = runBanner(
      summary({ byOutcome: { downloading: 1, analysing: 2, queued: 240, error: 3 } }),
      NOW,
    );

    expect(banner).toMatchObject({
      title: 'กำลังรันรอบดึงข้อมูล',
      detail: 'ดึงข้อมูล 1 · ประมวลผล 2 · รอคิว 243',
      stopping: false,
    });
  });

  test('a run that has only just started, with nothing in a stage yet, is still shown', () => {
    expect(runBanner(summary({ byOutcome: { queued: 10 } }), NOW)?.detail).toBe(
      'ดึงข้อมูล 0 · ประมวลผล 0 · รอคิว 10',
    );
  });

  test('says how long the run has been going, from the time the server recorded', () => {
    const started = new Date(NOW.getTime() - (12 * 60 + 30) * 1000).toISOString();

    expect(runBanner(summary({ runStartedAt: started }), NOW)?.elapsed).toBe(
      'รันมาแล้ว 12 นาที 30 วิ',
    );
  });

  test('says nothing of elapsed time when the server did not say when it began', () => {
    expect(runBanner(summary({ runStartedAt: null }), NOW)?.elapsed).toBeNull();
  });

  test('once an administrator has asked it to stop, says it is stopping and waiting for the record in hand', () => {
    const banner = runBanner(summary({ stopRequested: true }), NOW);

    expect(banner?.stopping).toBe(true);
    expect(banner?.title).toBe('กำลังหยุด… รอรายการที่ทำอยู่ให้เสร็จ');
  });
});

describe('formatElapsed', () => {
  const seconds = (n: number) => n * 1000;

  test('is seconds under a minute', () => {
    expect(formatElapsed(seconds(0))).toBe('0 วิ');
    expect(formatElapsed(seconds(45))).toBe('45 วิ');
    expect(formatElapsed(seconds(59))).toBe('59 วิ');
  });

  test('is minutes and seconds under an hour', () => {
    expect(formatElapsed(seconds(61))).toBe('1 นาที 1 วิ');
    expect(formatElapsed(seconds(12 * 60 + 30))).toBe('12 นาที 30 วิ');
    expect(formatElapsed(seconds(3599))).toBe('59 นาที 59 วิ');
  });

  test('is hours and minutes from an hour on, with no seconds', () => {
    expect(formatElapsed(seconds(3600))).toBe('1 ชม. 0 นาที');
    expect(formatElapsed(seconds(3600 + 12 * 60 + 40))).toBe('1 ชม. 12 นาที');
    expect(formatElapsed(seconds(25 * 3600))).toBe('25 ชม. 0 นาที');
  });

  test('a clock a little behind the server never shows a negative time', () => {
    expect(formatElapsed(seconds(-5))).toBe('0 วิ');
  });
});

describe('describeChange', () => {
  test('names the state and the outcome in Thai, side by side', () => {
    const change = describeChange({
      state: 'Queued',
      outcome: 'error',
      at: '2026-09-30T10:00:00.000Z',
      detail: 'HTTP 502',
    });
    expect(change.state).toBe('รอคิว');
    expect(change.outcome).toBe('ดึงข้อมูลผิดพลาด (จะลองใหม่)');
    expect(change.detail).toBe('HTTP 502');
  });

  test('leaves the detail out when there was none', () => {
    expect(
      describeChange({
        state: 'Completed',
        outcome: 'tor_analysed',
        at: '2026-09-30T10:00:00.000Z',
      }).detail,
    ).toBeUndefined();
  });
});

describe('describeQuota', () => {
  const NOW = Date.parse('2026-09-30T18:00:00.000Z');
  const today = (remainingDay: number) => ({
    remainingDay,
    limitDay: 1000,
    observedAt: '2026-09-30T15:00:00.000Z',
  });

  test('says nothing is known before a sweep has read it', () => {
    expect(describeQuota(null, NOW)).toEqual({
      label: 'โควตา open-data: ยังไม่ทราบ',
      low: false,
    });
  });

  test('shows what is left of the day, without alarm, while a full sweep is affordable', () => {
    const result = describeQuota(today(640), NOW);

    expect(result.label).toContain('640');
    expect(result.label).toContain('1,000');
    expect(result.low).toBe(false);
  });

  test('warns when what is left cannot cover a full sweep', () => {
    const result = describeQuota(today(120), NOW);

    expect(result.low).toBe(true);
    expect(result.label).toContain('120');
    expect(result.label).toMatch(/ไม่พอ/);
  });

  test('says plainly when it is used up', () => {
    const result = describeQuota(today(0), NOW);

    expect(result.low).toBe(true);
    expect(result.label).toMatch(/หมด/);
  });

  test('a reading from an earlier day is treated as stale, not as still true', () => {
    const result = describeQuota(
      { remainingDay: 0, limitDay: 1000, observedAt: '2026-09-29T15:00:00.000Z' },
      NOW,
    );

    expect(result.low).toBe(false);
    expect(result.label).toMatch(/ยังไม่ทราบ/);
  });
});
