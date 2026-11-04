import type { Timeline } from '@torfun/types';
import { MILESTONE_KEYS } from '@torfun/types';
import { convertTimelineDate } from './dates';
import { officialDeadline } from './deadline';
import { readStages, type AnnouncementRow } from './milestones';

export interface TimelineReview {
  timeline: Timeline;
  /** The stages or status differ from the stored ones. */
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
 * What a fresh read of a project's timeline means for the stored one: its
 * status and deadline, and whether anything moved that is worth more work.
 * Pure, so the pipeline only has to decide what to do about it.
 */
export function reviewTimeline(
  stored: Timeline,
  rows: readonly AnnouncementRow[],
  checkedAt: string,
): TimelineReview {
  const { stages, status, unrecognised } = readStages(rows);

  return {
    timeline: {
      status,
      lastReadAt: checkedAt,
      commentsCloseAt: stored.commentsCloseAt,
      deadlineAt: officialDeadline(stored.deadlineAt, stages),
      stages,
    },
    changed:
      status !== stored.status || MILESTONE_KEYS.some((key) => stages[key] !== stored.stages[key]),
    invitationMoved: stages.invited !== null && stages.invited !== stored.stages.invited,
    unrecognised: unrecognised.filter((row) => sinceLastCheck(row, stored.lastReadAt)),
  };
}
