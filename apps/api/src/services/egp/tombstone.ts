import {
  TOMBSTONE_REASON_LABELS,
  type FeedSnapshot,
  type Tombstone,
  type TombstoneReason,
} from '@torfun/types';
import { feedSnapshotOf } from './feed-record';

/**
 * The one place a Tombstone is put together, whoever decided: the pipeline when
 * the model drops a record, an administrator when they overrule it. The shape
 * (what is kept, what stands in for missing evidence) is therefore the same
 * whichever of them wrote it.
 *
 * `decidedBy` is null when the model decided and a username when a person did;
 * `now` is the caller's clock, so a test can fix the time. `record` is the
 * record being replaced: its feed fields are kept so a restore can queue the
 * project again without a sweep.
 */
export function buildTombstone(input: {
  projectId: string;
  reason: TombstoneReason;
  /** The quote or reason behind the decision; the reason's label stands in when there is none. */
  evidence?: string | null;
  promptVersion?: string | null;
  decidedBy: string | null;
  now: Date;
  record?: FeedSnapshot;
}): Tombstone {
  return {
    projectId: input.projectId,
    reason: input.reason,
    evidence: input.evidence || TOMBSTONE_REASON_LABELS[input.reason],
    promptVersion: input.promptVersion ?? null,
    decidedAt: input.now.toISOString(),
    decidedBy: input.decidedBy,
    ...(input.record ? { feed: feedSnapshotOf(input.record) } : {}),
  };
}
