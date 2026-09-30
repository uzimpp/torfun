import {
  DEFAULT_SCHEDULE,
  MAX_INTERVAL_HOURS,
  MIN_INTERVAL_HOURS,
  type ScheduleMode,
  type ScheduleUpdate,
  type ScheduleView,
} from '@torfun/types';

/**
 * The schedule form's rules, apart from the component that draws it, so they
 * can be tested without a DOM. The API validates the same limits from the same
 * schema; these exist so the person is told in Thai, beside the field, rather
 * than reading a 400.
 */

export interface ScheduleFormValues {
  enabled: boolean;
  mode: ScheduleMode;
  timeOfDay: string;
  everyHours: number;
}

export type ScheduleFormErrors = Partial<Record<'timeOfDay' | 'everyHours', string>>;

/** The intervals offered. Six is the floor the API enforces; a week is its ceiling. */
export const HOUR_CHOICES = [6, 8, 12, 24, 48] as const;

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Only the field the chosen mode uses is checked: the other is hidden, and a
 * refusal the person cannot see a reason for is worse than none.
 */
export function validateSchedule(values: ScheduleFormValues): ScheduleFormErrors {
  if (values.mode === 'daily') {
    return TIME_OF_DAY.test(values.timeOfDay)
      ? {}
      : { timeOfDay: 'กรุณาระบุเวลาที่ถูกต้อง เช่น 02:00' };
  }
  const { everyHours } = values;
  const valid =
    Number.isInteger(everyHours) &&
    everyHours >= MIN_INTERVAL_HOURS &&
    everyHours <= MAX_INTERVAL_HOURS;
  return valid
    ? {}
    : {
        everyHours: `ต้องเว้นระยะอย่างน้อย ${MIN_INTERVAL_HOURS} ชั่วโมง และไม่เกิน ${MAX_INTERVAL_HOURS} ชั่วโมง`,
      };
}

/**
 * What goes to the API: exactly the four fields it accepts. It validates every
 * field whatever the mode, so a time of day the person blanked and then hid by
 * switching to an interval is replaced with the default preset, not sent empty.
 */
export function toUpdate(values: ScheduleFormValues): ScheduleUpdate {
  const timeOfDay =
    values.mode === 'interval' && !TIME_OF_DAY.test(values.timeOfDay)
      ? DEFAULT_SCHEDULE.timeOfDay
      : values.timeOfDay;
  return {
    enabled: values.enabled,
    mode: values.mode,
    timeOfDay,
    everyHours: values.everyHours,
  };
}

export function toFormValues(view: ScheduleView): ScheduleFormValues {
  return {
    enabled: view.enabled,
    mode: view.mode,
    timeOfDay: view.timeOfDay,
    everyHours: view.everyHours,
  };
}

/**
 * The offered intervals, plus the stored one if it is not among them — an
 * administrator (or a later version) may have saved 36, and quietly showing 24
 * would change it on the next save.
 */
export function hourChoicesFor(current: number): number[] {
  const choices: number[] = [...HOUR_CHOICES];
  if (!choices.includes(current)) choices.push(current);
  return choices.sort((a, b) => a - b);
}

/** An instant as Bangkok time in Thai — the zone every schedule is read in, whatever the machine's. */
export function formatBangkok(iso: string | null): string {
  if (iso === null) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  });
}
