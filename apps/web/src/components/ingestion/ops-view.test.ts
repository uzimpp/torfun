import { describe, expect, test } from 'vitest';
import type { IngestionFailure, IngestionRun } from '@torfun/types';
import { formatDuration, groupFailures, isNoTor } from './ops-view';

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
