import type { Procurement } from '@torfun/types';
import { MILESTONE_KEYS } from '@torfun/types';
import { convertTimelineDate } from './dates';
import { decideDeadline } from './deadline';
import { readMilestones, statusFromMilestones, type AnnouncementRow } from './milestones';

/** What of a stored record a timeline reading is weighed against. */
export type TimelineSubject = Pick<
  Procurement,
  'milestones' | 'deadlineAt' | 'deadlineSource' | 'analysis' | 'timelineCheckedAt'
>;

export type TimelinePatch = Pick<
  Procurement,
  'milestones' | 'status' | 'timelineCheckedAt' | 'deadlineAt' | 'deadlineSource'
>;

export interface TimelineReview {
  /** The fields a reading writes. */
  patch: TimelinePatch;
  /** The milestones differ from the stored ones. */
  changed: boolean;
  /** The invitation has a date it did not have when it was last read, so its PDF is stale. */
  invitationMoved: boolean;
  /** Codes it does not know that the last check did not already hand back, to be logged. */
  unrecognised: AnnouncementRow[];
}

/**
 * Whether an unknown code may be new since the last check. Compared by Bangkok
 * day, not instant, so a row dated the day of the last check is not missed; such
 * a row may be logged by two checks, which is better than by none. An undated row
 * can only be told apart on the first read.
 */
function sinceLastCheck(row: AnnouncementRow, lastCheck: string | null): boolean {
  if (lastCheck === null) return true;
  const day = convertTimelineDate(row.announceDate);
  const lastDay = convertTimelineDate(lastCheck);
  return day !== null && (lastDay === null || day >= lastDay);
}

/**
 * What a fresh read of a project's timeline means for the stored record: its
 * status and deadline, and whether anything moved that is worth more work.
 * Pure, so the pipeline only has to decide what to do about it.
 */
export function reviewTimeline(
  stored: TimelineSubject,
  rows: readonly AnnouncementRow[],
  checkedAt: string,
): TimelineReview {
  const { milestones, unrecognised } = readMilestones(rows);
  const invitedAt = milestones.invited?.at ?? null;

  return {
    patch: {
      milestones,
      status: statusFromMilestones(milestones),
      timelineCheckedAt: checkedAt,
      ...decideDeadline(stored, {
        priced: milestones.priced?.at ?? null,
        invitationBidAt: null,
        torDeadline: stored.analysis?.deadlineAt ?? null,
      }),
    },
    changed: MILESTONE_KEYS.some(
      (key) => JSON.stringify(milestones[key]) !== JSON.stringify(stored.milestones[key]),
    ),
    invitationMoved: invitedAt !== null && invitedAt !== (stored.milestones.invited?.at ?? null),
    unrecognised: unrecognised.filter((row) => sinceLastCheck(row, stored.timelineCheckedAt)),
  };
}
