import { EMPTY_TIMELINE, type FeedSnapshot, type Procurement } from '@torfun/types';

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
    discoveredAt: timestamp,
    // From the project detail, which Retrieval reads first in the record's
    // turn (ADR-0020). Until then they are null, the year too.
    budgetYear: null,
    deptSubName: null,
    typeId: null,
    goodsId: null,
    projectMoney: null,
    priceBuild: null,
    detailReadAt: null,
    // Set from the timeline, the first thing Retrieval reads (ADR-0017).
    timeline: EMPTY_TIMELINE,

    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    statusHistory: [{ state: 'Queued', outcome: 'queued', at: timestamp }],
    approved: null,
    unpublished: null,

    archive: null,
    analysis: null,
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
    purchaseMethodName: record.purchaseMethodName,
  };
}
