import { addCalendarDays, thailandDay } from '@torfun/types';
import type { FindOptions } from '../repositories/procurement.repository';

/** Turns "days left" into calendar dates before a listing reaches the database. */
export function resolveProcurementListOptions(
  options: FindOptions,
  now = new Date(),
): FindOptions | null {
  const { minDaysLeft, ...filters } = options;
  const today = thailandDay(now);
  if (minDaysLeft === undefined) return { ...filters, today };
  // Only an open tender has days left; asking for another status finds nothing.
  if (filters.status && filters.status !== 'open') return null;
  return {
    ...filters,
    today,
    status: 'open',
    deadlineFrom: addCalendarDays(today, minDaysLeft),
  };
}
