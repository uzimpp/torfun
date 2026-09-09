import type { Procurement } from '@torfun/types';

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
  return {
    // Identity. Equal by construction — this is only ever called on a match.
    projectId: existing.projectId,

    // Owned by the agency, read from upstream on every sweep.
    projectName: incoming.projectName,
    deptName: incoming.deptName,
    deptSubName: incoming.deptSubName,
    year: incoming.year,
    announceDate: incoming.announceDate,
    projectTypeName: incoming.projectTypeName,
    purchaseMethodName: incoming.purchaseMethodName,
    projectMoney: incoming.projectMoney,
    priceBuild: incoming.priceBuild,
    status: incoming.status,
    winner: incoming.winner,

    // Where this sweep found it, which can move between fiscal years.
    registryName: incoming.registryName,
    deptCode: incoming.deptCode,

    // Derived from the fields above, so they refresh with them.
    eBidding: incoming.eBidding,
    softwareClass: incoming.softwareClass,
    softwareScore: incoming.softwareScore,

    // Owned by this system's pipeline. A rediscovery must never reset a
    // retrieval that already happened.
    state: existing.state,
    outcome: existing.outcome,
    statusHistory: existing.statusHistory,
    zipId: existing.zipId,
    zipBytes: existing.zipBytes,
    archiveMemberCount: existing.archiveMemberCount,
    documents: existing.documents,
    analysis: existing.analysis,
    torAmbiguous: existing.torAmbiguous,
    discoveredAt: existing.discoveredAt,

    // A project matching several keywords keeps all of them, across sweeps.
    matchedKeywords: [...new Set([...existing.matchedKeywords, ...incoming.matchedKeywords])],

    updatedAt: at,
  };
}
