import { describe, expect, test } from 'bun:test';
import { buildTombstone } from './tombstone';

const NOW = new Date('2026-10-03T08:00:00.000Z');

describe('buildTombstone', () => {
  test('keeps the evidence, the prompt version, who decided and when', () => {
    expect(
      buildTombstone({
        projectId: '1',
        reason: 'admin_non_software',
        evidence: 'จัดซื้อคอมพิวเตอร์',
        promptVersion: 'v3',
        decidedBy: 'somchai',
        now: NOW,
      }),
    ).toEqual({
      projectId: '1',
      reason: 'admin_non_software',
      evidence: 'จัดซื้อคอมพิวเตอร์',
      promptVersion: 'v3',
      decidedAt: '2026-10-03T08:00:00.000Z',
      decidedBy: 'somchai',
    });
  });

  test('a decision by the model has no person, and no prompt version is recorded as null', () => {
    const tombstone = buildTombstone({
      projectId: '1',
      reason: 'ai_not_software',
      evidence: 'x',
      decidedBy: null,
      now: NOW,
    });
    expect(tombstone).toMatchObject({ decidedBy: null, promptVersion: null });
  });

  test('without evidence the reason is spelled out in Thai instead of left empty', () => {
    const tombstone = buildTombstone({
      projectId: '1',
      reason: 'admin_deleted',
      evidence: null,
      decidedBy: 'somchai',
      now: NOW,
    });
    expect(tombstone.evidence).toMatch(/[฀-๿]/);
  });
});
