import { describe, expect, test } from 'vitest';
import type { IngestionFailure, IngestionRun } from '@torfun/types';
import {
  bangkokDate,
  dailySeries,
  formatBytes,
  formatDuration,
  groupFailures,
  isNoTor,
  perRecordMs,
} from './ops-view';

const failure = (overrides: Partial<IngestionFailure> = {}): IngestionFailure => ({
  projectId: '67109288963',
  projectName: 'จ้างพัฒนาระบบ',
  stage: 'download',
  kind: 'fault',
  error: 'HTTP 502',
  at: '2026-10-03T03:10:00.000Z',
  ...overrides,
});

const run = (overrides: Partial<IngestionRun> = {}): IngestionRun => ({
  id: 'r1',
  startedAt: '2026-10-03T03:00:00.000Z',
  endedAt: '2026-10-03T04:00:00.000Z',
  durationMs: 3_600_000,
  trigger: 'manual',
  runners: 2,
  counts: null,
  error: null,
  tokens: { prompt: 0, output: 0, thoughts: 0, total: 0, calls: 0 },
  peakRssBytes: 0,
  ...overrides,
});

describe('formatDuration', () => {
  test('says there is nothing to show for a missing value', () => {
    expect(formatDuration(null)).toBe('—');
  });

  test('keeps a tenth of a second under ten seconds', () => {
    expect(formatDuration(0)).toBe('0.0 วิ');
    expect(formatDuration(8_440)).toBe('8.4 วิ');
  });

  test('reads minutes and hours at the precision that is useful', () => {
    expect(formatDuration(42_000)).toBe('42 วิ');
    expect(formatDuration(9 * 60_000 + 6_000)).toBe('9 นาที 6 วิ');
    expect(formatDuration(3_600_000 + 2 * 60_000)).toBe('1 ชม. 2 นาที');
  });
});

describe('formatBytes', () => {
  test('reads memory in MB below a gigabyte and GB above', () => {
    expect(formatBytes(512 * 1024 * 1024)).toBe('512 MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
  });
});

describe('perRecordMs', () => {
  test('is the run wall time over the records it attempted', () => {
    const counts = { attempted: 4 } as IngestionRun['counts'];
    expect(perRecordMs(run({ durationMs: 60_000, counts }))).toBe(15_000);
  });

  test('is null where the run attempted nothing or never counted', () => {
    expect(perRecordMs(run({ counts: null }))).toBeNull();
    expect(perRecordMs(run({ counts: { attempted: 0 } as IngestionRun['counts'] }))).toBeNull();
  });
});

describe('bangkokDate', () => {
  test('is the calendar day in Bangkok, not in UTC', () => {
    expect(bangkokDate(new Date('2026-10-03T18:30:00.000Z'))).toBe('2026-10-04');
    expect(bangkokDate(new Date('2026-10-03T16:30:00.000Z'))).toBe('2026-10-03');
  });
});

describe('dailySeries', () => {
  const now = new Date('2026-10-04T05:00:00.000Z');

  test('covers thirty days ending today, oldest first', () => {
    const series = dailySeries([], now);
    expect(series).toHaveLength(30);
    expect(series[0]?.date).toBe('2026-09-05');
    expect(series.at(-1)?.date).toBe('2026-10-04');
  });

  test('fills the quiet days with zeros and keeps the active ones', () => {
    const series = dailySeries(
      [
        { date: '2026-10-01', completed: 12, held: 4, failed: 2 },
        { date: '2026-10-04', completed: 3, held: 0, failed: 0 },
      ],
      now,
    );
    expect(series.find((day) => day.date === '2026-10-01')).toEqual({
      date: '2026-10-01',
      completed: 12,
      held: 4,
      failed: 2,
    });
    expect(series.find((day) => day.date === '2026-10-02')).toEqual({
      date: '2026-10-02',
      completed: 0,
      held: 0,
      failed: 0,
    });
    expect(series.reduce((sum, day) => sum + day.completed, 0)).toBe(15);
  });

  test('crosses a month boundary without skipping or repeating a day', () => {
    const dates = dailySeries([], new Date('2026-03-02T00:00:00.000Z'), 4).map((day) => day.date);
    expect(dates).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  test('drops days older than the window', () => {
    const series = dailySeries([{ date: '2026-08-01', completed: 5, held: 5, failed: 5 }], now);
    expect(series.every((day) => day.completed === 0)).toBe(true);
  });
});

describe('isNoTor', () => {
  test('is what the pipeline marked when it logged the failure', () => {
    expect(isNoTor(failure({ stage: 'info', kind: 'no_tor' }))).toBe(true);
  });

  test('is never guessed from the wording', () => {
    expect(
      isNoTor(
        failure({
          stage: 'info',
          kind: 'fault',
          error: 'No zipId in the announcement response — no TOR package published.',
        }),
      ),
    ).toBe(false);
  });
});

describe('groupFailures', () => {
  const older = run({
    id: 'older',
    startedAt: '2026-10-02T03:00:00.000Z',
    endedAt: '2026-10-02T04:00:00.000Z',
  });
  const newer = run({ id: 'newer' });

  test('puts each failure in the run whose window holds it, newest run first', () => {
    const groups = groupFailures(
      [
        failure({ projectId: 'a', at: '2026-10-03T03:30:00.000Z' }),
        failure({ projectId: 'b', at: '2026-10-02T03:30:00.000Z' }),
      ],
      [newer, older],
      null,
    );

    expect(groups.map((group) => group.key)).toEqual(['newer', 'older']);
    expect(groups[0]?.problems[0]?.items.map((item) => item.projectId)).toEqual(['a']);
    expect(groups[1]?.run).toBe(older);
  });

  test('within a run, splits problems by stage and sets the no-TOR answers apart', () => {
    const [group] = groupFailures(
      [
        failure({ projectId: 'a', stage: 'analysis', error: 'Model timeout' }),
        failure({ projectId: 'b', stage: 'download' }),
        failure({ projectId: 'c', stage: 'download' }),
        failure({ projectId: 'd', stage: 'info', kind: 'no_tor' }),
      ],
      [newer],
      null,
    );

    expect(group?.problems.map((stage) => [stage.stage, stage.items.length])).toEqual([
      ['download', 2],
      ['analysis', 1],
    ]);
    expect(group?.noTor.map((item) => item.projectId)).toEqual(['d']);
    expect(group?.total).toBe(4);
  });

  test('a failure outside every recorded run goes to its own bucket, last', () => {
    const groups = groupFailures(
      [failure({ projectId: 'x', at: '2026-09-01T00:00:00.000Z' }), failure()],
      [newer],
      null,
    );

    expect(groups.map((group) => group.key)).toEqual(['newer', 'unassigned']);
    expect(groups[1]?.run).toBeNull();
    expect(groups[1]?.problems[0]?.items[0]?.projectId).toBe('x');
  });

  test('failures since the live run began belong to it, first', () => {
    const groups = groupFailures(
      [failure({ projectId: 'now', at: '2026-10-04T05:00:00.000Z' }), failure()],
      [newer],
      '2026-10-04T04:55:00.000Z',
    );

    expect(groups.map((group) => group.key)).toEqual(['live', 'newer']);
    expect(groups[0]?.live).toBe(true);
  });

  test('a run with no failures is not listed', () => {
    expect(groupFailures([failure()], [newer, older], null).map((group) => group.key)).toEqual([
      'newer',
    ]);
  });
});
