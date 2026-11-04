import { describe, expect, test } from 'bun:test';
import { isBiddable } from './status';

describe('isBiddable', () => {
  test('open is the only stage a bid is possible in', () => {
    // The whole point of typing this field: it is what puts a live tender ahead
    // of a settled contract in a run that stops early.
    expect(isBiddable('open')).toBe(true);
    for (const status of [
      'drafting',
      'evaluating',
      'awarded',
      'contracted',
      'cancelled',
      'unknown',
    ] as const) {
      expect(isBiddable(status)).toBe(false);
    }
  });
});
