import { addCalendarDays, thailandDay } from '@torfun/types';
import type { FindOptions } from '../repositories/procurement.repository';

/** Resolves user-facing relative deadlines before either listing reaches persistence. */
export function resolveProcurementListOptions(
  options: FindOptions,
  now = new Date(),
): FindOptions | null {
  const { deadlineDays, deadlineMode, ...filters } = options;
  if (deadlineDays === undefined) return filters;
  // A closed lifecycle cannot become an opportunity because its TOR has a future date.
  if (filters.status && filters.status !== 'open') return null;
  const today = thailandDay(now);
  const end = addCalendarDays(today, deadlineDays);
  return {
    ...filters,
    status: 'open',
    excludeAwarded: true,
    deadlineFrom: deadlineMode === 'exact' ? end : today,
    deadlineTo: end,
  };
}
