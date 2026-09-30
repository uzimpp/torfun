import { describe, expect, test } from 'vitest';
import { MAX_RETRIEVAL_ATTEMPTS } from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';
import { attemptsLabel, describeChange, runBanner, stageDuration } from './status-tracking';

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
    runInProgress: true,
    agencies: [],
    ...overrides,
  });

  test('is null while no run is in flight', () => {
    expect(runBanner(summary({ runInProgress: false }))).toBeNull();
  });

  test('says which stage the work is in and how much is left', () => {
    expect(
      runBanner(summary({ byOutcome: { downloading: 1, analysing: 2, queued: 240, error: 3 } })),
    ).toEqual({
      title: 'กำลังรันรอบดึงข้อมูล',
      detail: 'ดึงข้อมูล 1 · ประมวลผล 2 · รอคิว 243',
    });
  });

  test('a run that has only just started, with nothing in a stage yet, is still shown', () => {
    expect(runBanner(summary({ byOutcome: { queued: 10 } }))?.detail).toBe(
      'ดึงข้อมูล 0 · ประมวลผล 0 · รอคิว 10',
    );
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
