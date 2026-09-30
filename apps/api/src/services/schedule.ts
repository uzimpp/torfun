import type { Schedule } from '@torfun/types';

/**
 * When a Schedule next wants a Run — pure, so the rule can be tested without a
 * clock, a database or a timer.
 *
 * The next run is always measured from an anchor: whichever is later of when the
 * last Run *started* and when the schedule was last saved. That one choice gives
 * the behaviours that matter:
 *
 *  - Switching a schedule on (or changing it) starts nothing, however long ago
 *    the last Run was; the first run is the next slot after the save.
 *  - After downtime, exactly one catch-up run is due however many slots were
 *    missed, because that run's start becomes the new anchor. There is no burst.
 *  - A run that started on the slot does not make the same slot due again.
 *
 * Times of day are Asia/Bangkok, UTC+7 with no daylight saving.
 */
const BANGKOK_OFFSET_HOURS = 7;
const HOUR_MS = 60 * 60 * 1000;

/** The first daily slot strictly after `anchorMs`. */
function nextDailySlot(anchorMs: number, timeOfDay: string): number {
  const [hours = 0, minutes = 0] = timeOfDay.split(':').map(Number);
  const anchor = new Date(anchorMs);

  // A slot's Bangkok date is either the anchor's UTC date or the day after it,
  // so three UTC days from the anchor's own always contain the first slot after it.
  let earliest = Number.POSITIVE_INFINITY;
  for (let day = 0; day <= 2; day += 1) {
    const slot = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate() + day,
      hours - BANGKOK_OFFSET_HOURS,
      minutes,
    );
    if (slot > anchorMs && slot < earliest) earliest = slot;
  }
  return earliest;
}

/**
 * The instant the next Run is due, or null when there is none: the schedule is
 * off, or there is nothing to count from (which stamping `updatedAt` on every
 * save is there to prevent — a hand-edited document must not start a run on a
 * missing date).
 */
export function nextDueAt(schedule: Schedule, lastRunStartedAt: string | null): string | null {
  if (!schedule.enabled) return null;

  const anchors = [lastRunStartedAt, schedule.updatedAt]
    .filter((at): at is string => at !== null)
    .map((at) => Date.parse(at))
    .filter((ms) => !Number.isNaN(ms));
  if (anchors.length === 0) return null;
  const anchorMs = Math.max(...anchors);

  const dueMs =
    schedule.mode === 'interval'
      ? anchorMs + schedule.everyHours * HOUR_MS
      : nextDailySlot(anchorMs, schedule.timeOfDay);

  return new Date(dueMs).toISOString();
}

export function isDue(schedule: Schedule, lastRunStartedAt: string | null, now: Date): boolean {
  const due = nextDueAt(schedule, lastRunStartedAt);
  return due !== null && Date.parse(due) <= now.getTime();
}
