import { describe, expect, test } from 'vitest';
import type { IngestionRun, RunCounts } from '@torfun/types';

import { RUN_HISTORY_EMPTY, runHistoryRows, runResult } from './run-history-view';

const counts = (overrides: Partial<RunCounts> = {}): RunCounts => ({
  discovered: 30,
  newRecords: 12,
  changedRecords: 0,
  unchangedRecords: 18,
  discoverySkipped: false,
  discoveryStopped: null,
  rejectedNonRegistry: 0,
  attempted: 9,
  refreshed: 2,
  archivesRetrieved: 8,
  torAnalysed: 5,
  held: 2,
  dropped: 1,
  failed: 1,
  aborted: false,
  stopped: null,
  ...overrides,
});

const run = (overrides: Partial<IngestionRun> = {}): IngestionRun => ({
  id: 'run-1',
  startedAt: '2026-10-03T06:00:00.000Z',
  endedAt: '2026-10-03T06:09:06.000Z',
  durationMs: 546_000,
  trigger: 'scheduled',
  runners: 2,
  counts: counts(),
  error: null,
  tokens: { prompt: 120_000, output: 8_000, thoughts: 4_000, total: 132_000, calls: 12 },
  ...overrides,
});

describe('runResult', () => {
  test('a run that worked through its queue succeeded', () => {
    expect(runResult(run())).toEqual({ label: 'สำเร็จ', tone: 'ok' });
  });

  test('an administrator stopping it says so', () => {
    expect(runResult(run({ counts: counts({ stopped: 'admin' }) }))).toEqual({
      label: 'หยุดโดยผู้ดูแล',
      tone: 'neutral',
    });
  });

  test('a refusal from the site says the site refused, even where an admin also stopped it', () => {
    expect(runResult(run({ counts: counts({ aborted: true, stopped: 'admin' }) }))).toEqual({
      label: 'เว็บปฏิเสธ',
      tone: 'warn',
    });
  });

  test('a pass that threw is an error, whether or not it counted anything', () => {
    expect(runResult(run({ counts: null, error: 'boom' }))).toEqual({
      label: 'ผิดพลาด',
      tone: 'error',
    });
    expect(runResult(run({ error: 'boom' })).label).toBe('ผิดพลาด');
  });
});

describe('runHistoryRows', () => {
  test('reads each run in Bangkok time, newest first as the API sends them', () => {
    const rows = runHistoryRows([
      run({ id: 'new', startedAt: '2026-10-04T06:00:00.000Z', trigger: 'manual' }),
      run({ id: 'old' }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
    expect(rows[0]).toMatchObject({
      started: '4 ต.ค. 13:00',
      trigger: 'ด้วยมือ',
      duration: '9 นาที 6 วิ',
      attempted: '9',
      analysed: '5',
      held: '2',
      failed: '1',
      tokens: '132,000',
      result: { label: 'สำเร็จ' },
    });
    expect(rows[1]!.trigger).toBe('ตามตาราง');
  });

  test('splits the token total in its detail, and says what the count leaves out', () => {
    const [row] = runHistoryRows([run()]);
    expect(row!.tokenDetail).toBe(
      'prompt 120,000 · output 8,000 · thinking 4,000 — นับโดย Gemini; ไม่รวมการเรียกที่ล้มเหลว',
    );
  });

  test('a run that never counted leaves its counts blank rather than zero', () => {
    const [row] = runHistoryRows([run({ counts: null, error: 'boom' })]);
    expect(row).toMatchObject({ attempted: '—', analysed: '—', held: '—', failed: '—' });
  });

  test('has one sentence for an empty log', () => {
    expect(runHistoryRows([])).toEqual([]);
    expect(RUN_HISTORY_EMPTY).toBe('ยังไม่มีรอบที่บันทึก — เริ่มบันทึกตั้งแต่รอบถัดไป');
  });
});
