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

  test('keeps what the feed said about the record it replaces, and nothing read from its TOR', () => {
    const tombstone = buildTombstone({
      projectId: '69109044981',
      reason: 'ai_not_software',
      evidence: 'x',
      decidedBy: null,
      now: NOW,
      record: {
        projectName: 'จ้างพัฒนาระบบ',
        deptName: 'กรมศุลกากร',
        deptCode: '0305',
        announceDate: '2026-10-05T00:00:00.000Z',
        budgetYear: 2570,
        purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      },
    });
    expect(tombstone.feed).toEqual({
      projectName: 'จ้างพัฒนาระบบ',
      deptName: 'กรมศุลกากร',
      deptCode: '0305',
      announceDate: '2026-10-05T00:00:00.000Z',
      budgetYear: 2570,
      purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
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
