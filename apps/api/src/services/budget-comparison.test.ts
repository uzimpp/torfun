import { describe, expect, test } from 'bun:test';
import { EMPTY_TIMELINE, type Procurement, type TorAnalysis } from '@torfun/types';
import type { BudgetPeerCandidate } from '../repositories/procurement.repository';
import { compareBudget, PEER_LIMIT } from './budget-comparison';

const analysis = (techStack: string[], targetPlatforms: TorAnalysis['targetPlatforms']) =>
  ({
    summary: '',
    scopeOfWork: [],
    budgetThb: null,
    deadlineAt: null,
    durationDays: null,
    techStack,
    targetPlatforms,
    requiredQualifications: [],
  }) as TorAnalysis;

function tor(projectMoney: number | null, a: TorAnalysis | null): Procurement {
  return {
    projectId: 'target',
    projectName: 'Target',
    deptName: 'Agency',
    deptSubName: null,
    deptCode: '1',
    budgetYear: 2569,
    typeId: null,
    goodsId: null,
    detailReadAt: null,
    announceDate: null,
    purchaseMethodName: null,
    projectMoney,
    priceBuild: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    analysis: a,
    discoveredAt: '2026-09-16T00:00:00.000Z',
    timeline: EMPTY_TIMELINE,
    approved: null,
    archive: null,
    updatedAt: '2026-09-16T00:00:00.000Z',
  } as Procurement;
}

const peer = (
  projectId: string,
  projectMoney: number,
  techStack: string[],
  targetPlatforms: string[] = [],
): BudgetPeerCandidate => ({
  projectId,
  projectName: projectId,
  deptName: 'Agency',
  projectMoney,
  techStack,
  targetPlatforms,
});

describe('budget comparison', () => {
  test('quartiles and percentile over the similar peers', () => {
    const result = compareBudget(tor(3_000_000, analysis(['React'], ['web_app'])), [
      peer('a', 1_000_000, ['react']),
      peer('b', 2_000_000, ['React']),
      peer('c', 4_000_000, ['react', 'node']),
      peer('d', 5_000_000, ['REACT']),
    ]);
    expect(result).toMatchObject({
      budget: 3_000_000,
      peerCount: 4,
      min: 1_000_000,
      p25: 1_750_000,
      median: 3_000_000,
      p75: 4_250_000,
      max: 5_000_000,
      percentile: 50,
    });
  });

  test('a shared platform alone is not similar when the TOR names technology', () => {
    const result = compareBudget(tor(1_000_000, analysis(['Java'], ['web_app'])), [
      peer('platform-only', 9_000_000, ['PHP'], ['web_app']),
      peer('tech', 2_000_000, ['java']),
    ]);
    expect(result.peers.map((p) => p.projectId)).toEqual(['tech']);
    expect(result.peers[0]!.shared).toEqual(['java']);
  });

  test('ranks by shared technology first, and ignores itself and unknown budgets', () => {
    const result = compareBudget(tor(1_000_000, analysis(['React', 'Node'], ['web_app'])), [
      peer('target', 1, ['react', 'node'], ['web_app']),
      peer('zero', 0, ['react', 'node'], ['web_app']),
      peer('one', 1_000_000, ['react'], ['web_app']),
      peer('two', 1_000_000, ['react', 'node']),
    ]);
    expect(result.peers.map((p) => p.projectId)).toEqual(['two', 'one']);
  });

  test(`keeps at most ${PEER_LIMIT} peers`, () => {
    const many = Array.from({ length: PEER_LIMIT + 5 }, (_, i) =>
      peer(`p${String(i).padStart(2, '0')}`, 1_000 * (i + 1), ['react']),
    );
    expect(compareBudget(tor(1, analysis(['react'], [])), many).peerCount).toBe(PEER_LIMIT);
  });

  test('no announced budget or no peers leaves the numbers empty', () => {
    expect(
      compareBudget(tor(null, analysis(['react'], [])), [peer('a', 5, ['react'])]),
    ).toMatchObject({
      budget: null,
      peerCount: 1,
      percentile: null,
    });
    expect(compareBudget(tor(5, null), [peer('a', 5, ['react'])])).toMatchObject({
      peerCount: 0,
      median: null,
      percentile: null,
      peers: [],
    });
  });
});
