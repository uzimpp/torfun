import { describe, expect, test } from 'bun:test';
import { EMPTY_STAGES, type MilestoneKey, type ProcurementStatus } from '@torfun/types';
import { readStages } from './milestones';

const row = (announceType: string, announceDate: string | null = null) => ({
  announceType,
  announceDate,
});

describe('readStages', () => {
  test.each([
    ['BOQ', 'drafted'],
    ['B0', 'drafted'],
    ['D0', 'invited'],
    ['price', 'priced'],
    ['S0', 'evaluated'],
    ['E0', 'evaluated'],
    ['W0', 'awarded'],
    ['I0', 'contracted'],
  ] as const)('%s sets %s, dated by the Bangkok day', (code, key) => {
    const { stages, unrecognised } = readStages([row(code, '2026-09-30T17:00:00.000Z')]);

    expect(stages).toEqual({ ...EMPTY_STAGES, [key]: '2026-10-01T00:00:00.000Z' });
    expect(unrecognised).toEqual([]);
  });

  test('several rows for one stage keep the latest date, and a date beats none', () => {
    const { stages } = readStages([
      row('BOQ', '2026-08-01T00:00:00.000Z'),
      row('B0', '2026-08-09T00:00:00.000Z'),
      row('BOQ', '2026-08-03T00:00:00.000Z'),
      row('S0'),
      row('E0', '2026-09-20T00:00:00.000Z'),
      row('S0'),
    ]);

    expect(stages.drafted).toBe('2026-08-09T00:00:00.000Z');
    expect(stages.evaluated).toBe('2026-09-20T00:00:00.000Z');
  });

  test('a code it does not know sets nothing and is handed back once', () => {
    const { stages, status, unrecognised } = readStages([
      row('explain', '2026-09-02T00:00:00.000Z'),
      row('explain', '2026-09-03T00:00:00.000Z'),
      row('X9'),
    ]);

    expect(stages).toEqual(EMPTY_STAGES);
    expect(status).toBe('unknown');
    expect(unrecognised.map((entry) => entry.announceType)).toEqual(['explain', 'X9']);
  });

  test('an empty timeline reaches nothing', () => {
    expect(readStages([])).toEqual({ stages: EMPTY_STAGES, status: 'unknown', unrecognised: [] });
  });
});

describe('the status readStages works out', () => {
  const CODE: Record<MilestoneKey, string> = {
    drafted: 'B0',
    invited: 'D0',
    priced: 'price',
    evaluated: 'E0',
    awarded: 'W0',
    contracted: 'I0',
  };
  const reached = (...keys: MilestoneKey[]) =>
    readStages(keys.map((key) => row(CODE[key], '2026-09-01T00:00:00.000Z'))).status;

  test.each<[MilestoneKey, ProcurementStatus]>([
    ['drafted', 'drafting'],
    ['invited', 'open'],
    ['priced', 'evaluating'],
    ['evaluated', 'evaluating'],
    ['awarded', 'awarded'],
    ['contracted', 'contracted'],
  ])('%s alone is %s', (key, status) => {
    expect(reached(key)).toBe(status);
  });

  test('the highest stage reached wins', () => {
    expect(reached('drafted', 'invited', 'priced')).toBe('evaluating');
    expect(reached('drafted', 'awarded')).toBe('awarded');
  });

  test('a reached stage with no date still counts, though it has no date to keep', () => {
    const reading = readStages([row('S0'), row('E0')]);

    expect(reading.status).toBe('evaluating');
    expect(reading.stages.evaluated).toBeNull();
  });
});
