import { z } from 'zod';

/**
 * When a Run starts without a Site Administrator pressing the button.
 *
 * Presets only — a time of day, or an interval — rather than a cron string, so
 * an administrator cannot type something that fires every minute. The floor on
 * the interval is the point of the whole type: a Schedule decides how much the
 * system asks of the upstream in a day, and the per-run download cap is only
 * one half of that arithmetic. Six hours is a policy, not a measurement.
 *
 * All times of day are Asia/Bangkok (UTC+7, no daylight saving).
 */
export const MIN_INTERVAL_HOURS = 6;
export const MAX_INTERVAL_HOURS = 168;

export const ScheduleMode = z.enum(['daily', 'interval']);
export type ScheduleMode = z.infer<typeof ScheduleMode>;

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');

/** What an administrator sets. */
export const ScheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  mode: ScheduleMode,
  /** Used when `mode` is `daily`. Kept when the mode changes, so switching back is lossless. */
  timeOfDay: TimeOfDay,
  /** Used when `mode` is `interval`. */
  everyHours: z.number().int().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS),
});
export type ScheduleUpdate = z.infer<typeof ScheduleUpdateSchema>;

/** What is stored: the setting, and who last changed it and when. */
export const ScheduleSchema = ScheduleUpdateSchema.extend({
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/**
 * The setting an installation starts with: off. A developer's machine or a
 * fresh deployment must not begin asking the upstream for things because
 * someone ran a migration; an administrator turns it on. The 02:00 preset is
 * only what the form is pre-filled with.
 */
export const DEFAULT_SCHEDULE: Schedule = {
  enabled: false,
  mode: 'daily',
  timeOfDay: '02:00',
  everyHours: 24,
  updatedAt: null,
  updatedBy: null,
};

/** The setting plus what it implies: when a Run last started, and when the next is due. */
export const ScheduleViewSchema = ScheduleSchema.extend({
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
});
export type ScheduleView = z.infer<typeof ScheduleViewSchema>;
