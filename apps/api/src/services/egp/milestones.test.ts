import { describe, expect, test } from 'bun:test';
import { EMPTY_MILESTONES, type Milestones, type ProcurementStatus } from '@torfun/types';
import { readMilestones, statusFromMilestones } from './milestones';

const row = (announceType: string, announceDate: string | null = null) => ({
  announceType,
  announceDate,
});

describe('readMilestones', () => {
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
    const { milestones, unrecognised } = readMilestones([row(code, '2026-09-30T17:00:00.000Z')]);

    expect(milestones).toEqual({ ...EMPTY_MILESTONES, [key]: { at: '2026-10-01T00:00:00.000Z' } });
    expect(unrecognised).toEqual([]);
  });

  test('a reached stage whose date e-GP leaves null is reached with an empty date', () => {
    expect(readMilestones([row('S0'), row('E0')]).milestones.evaluated).toEqual({ at: null });
  });

  test('several rows for one stage keep the latest date, and a date beats none', () => {
    const { milestones } = readMilestones([
      row('BOQ', '2026-08-01T00:00:00.000Z'),
      row('B0', '2026-08-09T00:00:00.000Z'),
      row('BOQ', '2026-08-03T00:00:00.000Z'),
      row('S0'),
      row('E0', '2026-09-20T00:00:00.000Z'),
      row('S0'),
    ]);

    expect(milestones.drafted).toEqual({ at: '2026-08-09T00:00:00.000Z' });
    expect(milestones.evaluated).toEqual({ at: '2026-09-20T00:00:00.000Z' });
  });

  test('a code it does not know sets nothing and is handed back once', () => {
    const { milestones, unrecognised } = readMilestones([
      row('explain', '2026-09-02T00:00:00.000Z'),
      row('explain', '2026-09-03T00:00:00.000Z'),
      row('X9'),
    ]);

    expect(milestones).toEqual(EMPTY_MILESTONES);
    expect(unrecognised.map((entry) => entry.announceType)).toEqual(['explain', 'X9']);
  });

  test('an empty timeline reaches nothing', () => {
    expect(readMilestones([]).milestones).toEqual(EMPTY_MILESTONES);
  });
});

describe('statusFromMilestones', () => {
  const reached = (...keys: Array<keyof Milestones>): Milestones => ({
    ...EMPTY_MILESTONES,
    ...Object.fromEntries(keys.map((key) => [key, { at: '2026-09-01T00:00:00.000Z' }])),
  });

  test.each<[keyof Milestones, ProcurementStatus]>([
    ['drafted', 'drafting'],
    ['invited', 'open'],
    ['priced', 'evaluating'],
    ['evaluated', 'evaluating'],
    ['awarded', 'awarded'],
    ['contracted', 'contracted'],
  ])('%s alone is %s', (key, status) => {
    expect(statusFromMilestones(reached(key))).toBe(status);
  });

  test('the highest stage reached wins', () => {
    expect(statusFromMilestones(reached('drafted', 'invited', 'priced'))).toBe('evaluating');
    expect(statusFromMilestones(reached('drafted', 'awarded'))).toBe('awarded');
  });

  test('a reached stage with no date still counts', () => {
    expect(statusFromMilestones({ ...EMPTY_MILESTONES, evaluated: { at: null } })).toBe(
      'evaluating',
    );
  });

  test('nothing reached is unknown', () => {
    expect(statusFromMilestones(EMPTY_MILESTONES)).toBe('unknown');
  });
});
