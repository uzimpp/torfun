import { describe, expect, test } from 'bun:test';
import type { HoldReason } from '@torfun/types';
import { decideOutcome, type OutcomeDecision } from './decision';

const SHOWN: OutcomeDecision = { result: 'shown', outcome: 'tor_analysed' };
const DROP: OutcomeDecision = { result: 'drop' };
const held = (holdReason: HoldReason): OutcomeDecision => ({
  result: 'held',
  outcome: 'needs_review',
  holdReason,
});

describe('decideOutcome', () => {
  // The spec's decision table, one row per case. Only a confident answer from
  // the whole document acts on its own; everything else waits for a person.
  test.each([
    {
      name: 'software, confident',
      isSoftware: true,
      confidence: 'high',
      partialRead: false,
      expected: SHOWN,
    },
    {
      name: 'not software, confident',
      isSoftware: false,
      confidence: 'high',
      partialRead: false,
      expected: DROP,
    },
    {
      name: 'software, unsure',
      isSoftware: true,
      confidence: 'low',
      partialRead: false,
      expected: held('ai_low_confidence'),
    },
    {
      name: 'not software, unsure',
      isSoftware: false,
      confidence: 'low',
      partialRead: false,
      expected: held('ai_not_software_low'),
    },
    {
      name: 'a partial read, software',
      isSoftware: true,
      confidence: 'high',
      partialRead: true,
      expected: held('partial_read'),
    },
    {
      name: 'a partial read, not software',
      isSoftware: false,
      confidence: 'high',
      partialRead: true,
      expected: held('partial_read'),
    },
    {
      name: 'a partial read that is also unsure',
      isSoftware: false,
      confidence: 'low',
      partialRead: true,
      expected: held('partial_read'),
    },
  ] as const)('$name', ({ isSoftware, confidence, partialRead, expected }) => {
    expect(decideOutcome({ isSoftware, confidence, partialRead })).toEqual(expected);
  });
});
