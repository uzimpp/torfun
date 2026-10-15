import { EMPTY_MILESTONES, type FeedSnapshot, type Procurement } from '@torfun/types';

/**
 * A project as Discovery first stores it: what the announcement feed said, and
 * nothing yet retrieved. Built here for both ways a project enters the queue:
 * a sweep that finds it, and an administrator restoring its tombstone from the
 * snapshot the tombstone kept.
 */
export function queuedRecord(projectId: string, feed: FeedSnapshot, now: Date): Procurement {
  const timestamp = now.toISOString();
  return {
    projectId,
    ...feed,
    // From the project detail, which Discovery lays over this. A restored
    // record has none, so record work reads it before anything else.
    deptSubName: null,
    typeId: null,
    goodsId: null,
    detailCheckedAt: null,
    // Not in the feed. Null says "not known", which is the truth.
    projectTypeName: null,
    projectMoney: null,
    priceBuild: null,
    // Set from the timeline, the first thing Retrieval reads (ADR-0017).
    status: 'unknown',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,

    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [{ state: 'Queued', outcome: 'queued', at: timestamp }],

    zipId: null,
    documents: [],
    analysis: null,
    torAmbiguous: false,

    discoveredAt: timestamp,
    sourceHash: null, // fingerprinted by the store as it writes
    updatedAt: timestamp,
  };
}

/** The feed's part of a record, as a tombstone keeps it. */
export function feedSnapshotOf(record: FeedSnapshot): FeedSnapshot {
  return {
    projectName: record.projectName,
    deptName: record.deptName,
    deptCode: record.deptCode,
    announceDate: record.announceDate,
    budgetYear: record.budgetYear,
    purchaseMethodName: record.purchaseMethodName,
  };
}
