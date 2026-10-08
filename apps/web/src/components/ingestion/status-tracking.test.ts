import { describe, expect, test } from 'vitest';
import { MAX_RETRIEVAL_ATTEMPTS } from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';
import {
  attemptsLabel,
  formatClock,
  formatElapsed,
  runStatus,
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

describe('runStatus', () => {
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

  test('with no run in flight, is idle and says so, with no clock', () => {
    expect(runStatus(summary({ runInProgress: false }), NOW)).toEqual({
      phase: 'idle',
      label: 'ไม่มีรอบที่กำลังทำงาน',
      elapsed: null,
    });
  });

  test('a run in flight is fetching, timed from the start the server recorded', () => {
    const started = new Date(NOW.getTime() - (12 * 60 + 30) * 1000).toISOString();

    expect(runStatus(summary({ runStartedAt: started }), NOW)).toEqual({
      phase: 'running',
      label: 'กำลังดึงข้อมูล',
      elapsed: '12:30',
    });
  });

  test('says nothing of elapsed time when the server did not say when it began', () => {
    expect(runStatus(summary({ runStartedAt: null }), NOW).elapsed).toBeNull();
  });

  test('once an administrator has asked it to stop, it is stopping', () => {
    expect(runStatus(summary({ stopRequested: true }), NOW)).toMatchObject({
      phase: 'stopping',
      label: 'กำลังหยุด',
    });
  });
});

describe('formatClock', () => {
  const seconds = (n: number) => n * 1000;

  test('reads minutes and seconds as a two-digit clock under an hour', () => {
    expect(formatClock(seconds(0))).toBe('00:00');
    expect(formatClock(seconds(9 * 60 + 6))).toBe('09:06');
    expect(formatClock(seconds(59 * 60 + 59))).toBe('59:59');
  });

  test('adds hours once there are any', () => {
    expect(formatClock(seconds(3600 + 2 * 60 + 3))).toBe('1:02:03');
    expect(formatClock(seconds(25 * 3600))).toBe('25:00:00');
  });

  test('never runs backwards past zero', () => {
    expect(formatClock(seconds(-5))).toBe('00:00');
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
