import { describe, expect, test } from 'bun:test';
import { EMPTY_STAGES } from '@torfun/types';
import { officialDeadline } from './deadline';

const INVITATION = '2026-10-20T09:30:00.000Z';
const PRICED = '2026-10-22T00:00:00.000Z';
const STORED = '2026-10-15T00:00:00.000Z';

describe('officialDeadline', () => {
  const priced = { ...EMPTY_STAGES, priced: PRICED };

  test('the timeline outranks the invitation and what was stored', () => {
    expect(officialDeadline(STORED, priced, INVITATION)).toBe(PRICED);
  });

  test('the invitation replaces what was stored, so a re-dated invitation is followed', () => {
    expect(officialDeadline(STORED, EMPTY_STAGES, INVITATION)).toBe(INVITATION);
  });

  test('is kept when the pass states none', () => {
    expect(officialDeadline(STORED, EMPTY_STAGES)).toBe(STORED);
  });

  test('is empty when nothing states one', () => {
    expect(officialDeadline(null, EMPTY_STAGES)).toBeNull();
  });
});
