import type { Procurement } from '@torfun/types';

/**
 * Merge a freshly discovered record into the one already stored.
 *
 * Discovery builds a complete `Procurement` from the feed on every sweep.
 * Which half of it survives is a question of ownership: the feed owns what an
 * agency published there, this system owns what its own pipeline found out.
 * Refreshing the first and preserving the second is the whole rule.
 *
 * Written out field by field rather than by spreading, so adding anything to
 * `Procurement` fails to compile here until someone says which side it belongs
 * to. The version this replaced kept the stored record and merged only the
 * keywords, silently discarding the row it had just been handed.
 *
 * `changed` says whether the agency's data moved (`hasUpstreamChange`). A sweep
 * returns every record every time, so seeing one again is not news: only a
 * change moves `updatedAt`, or a "recently updated" list would just be whatever
 * the last sweep touched.
 */
export function mergeDiscovered(
  existing: Procurement,
  incoming: Procurement,
  changed: boolean,
  at: string = new Date().toISOString(),
): Procurement {
  return {
    // Identity. Equal by construction — this is only ever called on a match.
    projectId: existing.projectId,

    // Owned by the agency, read from the feed on every sweep.
    projectName: incoming.projectName,
    deptName: incoming.deptName,
    announceDate: incoming.announceDate,
    purchaseMethodName: incoming.purchaseMethodName,

    // Where this sweep found it, which can move between fiscal years.
    deptCode: incoming.deptCode,

    // Read from e-GP's project detail, which the feed does not carry.
    deptSubName: existing.deptSubName,
    budgetYear: existing.budgetYear,
    typeId: existing.typeId,
    goodsId: existing.goodsId,
    projectMoney: existing.projectMoney,
    priceBuild: existing.priceBuild,
    detailReadAt: existing.detailReadAt,

    // Owned by this system's pipeline. A rediscovery must never reset a
    // retrieval that already happened, nor the stage its timeline established:
    // the feed carries neither.
    timeline: existing.timeline,
    state: existing.state,
    outcome: existing.outcome,
    attempts: existing.attempts,
    holdReason: existing.holdReason,
    statusHistory: existing.statusHistory,
    approved: existing.approved,
    archive: existing.archive,
    analysis: existing.analysis,
    discoveredAt: existing.discoveredAt,

    updatedAt: changed ? at : existing.updatedAt,
  };
}
