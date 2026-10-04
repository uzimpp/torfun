import type { Procurement } from '@torfun/types';
import { hashSource, hasUpstreamChange } from './source-hash';

/**
 * Merge a freshly discovered record into the one already stored.
 *
 * Discovery builds a complete `Procurement` from the upstream row on every
 * sweep. Which half of it survives is a question of ownership: the open-data
 * API owns what an agency published, this system owns what its own pipeline
 * found out. Refreshing the first and preserving the second is the whole rule.
 *
 * Written out field by field rather than by spreading, so adding anything to
 * `Procurement` fails to compile here until someone says which side it belongs
 * to. The version this replaced kept the stored record and merged only the
 * keywords, silently discarding the row it had just been handed.
 */
export function mergeDiscovered(
  existing: Procurement,
  incoming: Procurement,
  at: string = new Date().toISOString(),
): Procurement {
  // A sweep returns every record every time, so seeing one again is not news.
  // Only a difference in what the agency owns moves `updatedAt`; otherwise a
  // "recently updated" list would just be whatever the last sweep touched.
  const changed = hasUpstreamChange(existing, incoming);

  return {
    // Identity. Equal by construction — this is only ever called on a match.
    projectId: existing.projectId,

    // Owned by the agency, read from upstream on every sweep.
    projectName: incoming.projectName,
    deptName: incoming.deptName,
    deptSubName: incoming.deptSubName,
    province: incoming.province,
    district: incoming.district,
    subdistrict: incoming.subdistrict,
    budgetYear: incoming.budgetYear,
    announceDate: incoming.announceDate,
    projectTypeName: incoming.projectTypeName,
    purchaseMethodName: incoming.purchaseMethodName,
    projectMoney: incoming.projectMoney,
    priceBuild: incoming.priceBuild,
    winner: incoming.winner,

    // Where this sweep found it, which can move between fiscal years.
    deptCode: incoming.deptCode,

    // Owned by this system's pipeline. A rediscovery must never reset a
    // retrieval that already happened, nor the stage its timeline established:
    // the feed carries neither.
    status: existing.status,
    milestones: existing.milestones,
    timelineCheckedAt: existing.timelineCheckedAt,
    deadlineAt: existing.deadlineAt,
    deadlineSource: existing.deadlineSource,
    state: existing.state,
    outcome: existing.outcome,
    attempts: existing.attempts,
    holdReason: existing.holdReason,
    approvedBy: existing.approvedBy,
    approvedAt: existing.approvedAt,
    statusHistory: existing.statusHistory,
    zipId: existing.zipId,
    documents: existing.documents,
    analysis: existing.analysis,
    torAmbiguous: existing.torAmbiguous,
    discoveredAt: existing.discoveredAt,

    sourceHash: hashSource(incoming),
    updatedAt: changed ? at : existing.updatedAt,
  };
}
