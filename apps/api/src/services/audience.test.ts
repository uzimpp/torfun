import { describe, expect, test } from 'bun:test';
import type { Procurement } from '@torfun/types';
import { presentTo } from './audience';

const held = {
  projectId: '1',
  outcome: 'needs_review',
  holdReason: 'partial_read',
  approvedBy: 'somchai',
  approvedAt: '2026-10-03T08:00:00.000Z',
} as Procurement;

describe('presentTo', () => {
  test('an officer gets the record without the review note or the approving administrator', () => {
    expect(presentTo('officer', held)).toEqual({
      ...held,
      holdReason: null,
      approvedBy: null,
      approvedAt: null,
    });
  });

  test('an administrator gets the record as stored, and the stored one is never altered', () => {
    expect(presentTo('admin', held)).toBe(held);
    presentTo('officer', held);
    expect(held.approvedBy).toBe('somchai');
  });
});
