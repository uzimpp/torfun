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

/**
 * The first slot strictly after `anchorMs` that falls on one of `weekdays`, at
 * `timeOfDay` Bangkok time. Every day ticked is a daily schedule.
 */
function nextWeeklySlot(anchorMs: number, timeOfDay: string, weekdays: readonly number[]): number {
  const [hours = 0, minutes = 0] = timeOfDay.split(':').map(Number);
  const anchor = new Date(anchorMs);

  // A slot's Bangkok date is either the anchor's UTC date or the day after it,
  // and a week of them always holds a chosen day, so scanning nine UTC days from
  // the anchor's own always contains the first slot after it.
  let earliest = Number.POSITIVE_INFINITY;
  for (let day = 0; day <= 8; day += 1) {
    const slot = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate() + day,
      hours - BANGKOK_OFFSET_HOURS,
      minutes,
    );
    // The weekday is the one it is in Bangkok, which is the UTC weekday of the
    // slot shifted forward by the offset.
    const bangkokWeekday = new Date(slot + BANGKOK_OFFSET_HOURS * HOUR_MS).getUTCDay();
    if (weekdays.includes(bangkokWeekday) && slot > anchorMs && slot < earliest) earliest = slot;
  }
  return earliest;
}

/** The next slot after `anchorMs`, by the schedule's own rule. */
function slotAfter(schedule: Schedule, anchorMs: number): number {
  return schedule.mode === 'interval'
    ? anchorMs + schedule.everyHours * HOUR_MS
    : nextWeeklySlot(anchorMs, schedule.timeOfDay, schedule.weekdays);
}

/** Whichever is later of the last run's start and the last save; null if neither is a date. */
function anchorOf(schedule: Schedule, lastRunStartedAt: string | null): number | null {
  const anchors = [lastRunStartedAt, schedule.updatedAt]
    .filter((at): at is string => at !== null)
    .map((at) => Date.parse(at))
    .filter((ms) => !Number.isNaN(ms));
  return anchors.length === 0 ? null : Math.max(...anchors);
}

/**
 * The instant the next Run is due, or null when there is none: the schedule is
 * off, or there is nothing to count from (which stamping `updatedAt` on every
 * save is there to prevent — a hand-edited document must not start a run on a
 * missing date).
 */
export function nextDueAt(schedule: Schedule, lastRunStartedAt: string | null): string | null {
  if (!schedule.enabled) return null;
  const anchorMs = anchorOf(schedule, lastRunStartedAt);
  return anchorMs === null ? null : new Date(slotAfter(schedule, anchorMs)).toISOString();
}

/**
 * The next `count` runs, soonest first, each assuming the one before started on
 * time. Only the first is a promise the scheduler keeps; the rest are what the
 * setting implies, for an administrator to check it says what they meant.
 */
export function upcomingRuns(
  schedule: Schedule,
  lastRunStartedAt: string | null,
  count: number,
): string[] {
  if (!schedule.enabled) return [];
  let anchorMs = anchorOf(schedule, lastRunStartedAt);
  if (anchorMs === null) return [];

  const runs: string[] = [];
  for (let i = 0; i < count; i += 1) {
    anchorMs = slotAfter(schedule, anchorMs);
    runs.push(new Date(anchorMs).toISOString());
  }
  return runs;
}

export function isDue(schedule: Schedule, lastRunStartedAt: string | null, now: Date): boolean {
  const due = nextDueAt(schedule, lastRunStartedAt);
  return due !== null && Date.parse(due) <= now.getTime();
}
