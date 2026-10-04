import { z } from 'zod';

/**
 * When a Run starts without a Site Administrator pressing the button.
 *
 * Two modes only — every N hours, or chosen weekdays at a time of day — rather than a cron string, so
 * an administrator cannot type something that fires every minute. The floor on
 * the interval is the point of the whole type: a Schedule decides how much the
 * system asks of the upstream in a day: a Run works through the whole queue, so
 * how often one starts is the only measure of volume there is. Six hours is a policy, not a measurement.
 *
 * All times of day are Asia/Bangkok (UTC+7, no daylight saving).
 */
export const MIN_INTERVAL_HOURS = 6;
export const MAX_INTERVAL_HOURS = 168;

/**
 * "Daily" is not a mode of its own: it is every 24 hours, or weekly with every
 * day ticked. Weekdays count from Sunday as 0, the way `Date#getDay` does and the
 * Thai week does.
 */
export const ScheduleMode = z.enum(['interval', 'weekly']);
export type ScheduleMode = z.infer<typeof ScheduleMode>;

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const WORKING_WEEKDAYS = [1, 2, 3, 4, 5] as const;

const Weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Choose at least one day')
  .refine((days) => new Set(days).size === days.length, 'A day may be chosen only once');

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:MM');

/** What an administrator sets. */
export const ScheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  mode: ScheduleMode,
  /** Used when `mode` is `weekly`. Kept when the mode changes, so switching back is lossless. */
  timeOfDay: TimeOfDay,
  /** Used when `mode` is `weekly`: the days a run is due, each at `timeOfDay`. */
  weekdays: Weekdays,
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
 * someone ran a migration; an administrator turns it on. What it is pre-filled
 * with is weekdays at 13:00, an hour after e-bidding submissions usually close.
 */
export const DEFAULT_SCHEDULE: Schedule = {
  enabled: false,
  mode: 'weekly',
  timeOfDay: '13:00',
  weekdays: [...WORKING_WEEKDAYS],
  everyHours: 24,
  updatedAt: null,
  updatedBy: null,
};

/** The setting plus what it implies: when a Run last started, and when the next is due. */
export const ScheduleViewSchema = ScheduleSchema.extend({
  lastRunAt: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  /** The next few runs, soonest first, assuming each starts on time. Empty when none is due. */
  upcomingRunAts: z.array(z.string()),
});
export type ScheduleView = z.infer<typeof ScheduleViewSchema>;
