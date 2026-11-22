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
  weekdays: number[];
  everyHours: number;
}

export type ScheduleFormErrors = Partial<Record<'timeOfDay' | 'weekdays' | 'everyHours', string>>;

/** The intervals offered as buttons: a day, two, three, a week. Anything else is typed in. */
export const INTERVAL_PRESETS = [24, 48, 72, 168] as const;

export const isPreset = (hours: number): boolean =>
  (INTERVAL_PRESETS as readonly number[]).includes(hours);

/** Sunday first, matching the stored numbers (`Date#getDay`) and the Thai week. */
export const WEEKDAY_LABELS = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
] as const;

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Only the fields the chosen mode uses are checked: the others are hidden, and a
 * refusal the person cannot see a reason for is worse than none.
 */
export function validateSchedule(values: ScheduleFormValues): ScheduleFormErrors {
  if (values.mode === 'weekly') {
    const errors: ScheduleFormErrors = {};
    if (values.weekdays.length === 0) errors.weekdays = 'กรุณาเลือกอย่างน้อยหนึ่งวัน';
    if (!TIME_OF_DAY.test(values.timeOfDay))
      errors.timeOfDay = 'กรุณาระบุเวลาที่ถูกต้อง เช่น 13:00';
    return errors;
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
 * What goes to the API: exactly the five fields it accepts. It validates every
 * field whatever the mode, so a time or a day list the person blanked and then
 * hid by switching to an interval is replaced with the default, not sent empty.
 */
export function toUpdate(values: ScheduleFormValues): ScheduleUpdate {
  const weekdays = [...new Set(values.weekdays)].sort((a, b) => a - b);
  const hidden = values.mode === 'interval';
  return {
    enabled: values.enabled,
    mode: values.mode,
    timeOfDay:
      hidden && !TIME_OF_DAY.test(values.timeOfDay) ? DEFAULT_SCHEDULE.timeOfDay : values.timeOfDay,
    weekdays: hidden && weekdays.length === 0 ? [...DEFAULT_SCHEDULE.weekdays] : weekdays,
    everyHours: values.everyHours,
  };
}

export function toFormValues(view: ScheduleView): ScheduleFormValues {
  return {
    enabled: view.enabled,
    mode: view.mode,
    timeOfDay: view.timeOfDay,
    weekdays: [...view.weekdays],
    everyHours: view.everyHours,
  };
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
