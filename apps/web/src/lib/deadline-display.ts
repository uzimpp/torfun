import type { ProcurementStatus } from '@torfun/types';
import { formatThaiDate } from './format-date';

/** A deadline stored with no stated time is midnight UTC (see the API's `convertDateToISO`). */
const DATE_ONLY = /T00:00:00\.000Z$/;

/**
 * How a bid deadline reads to an officer. A project still in drafting has no bid
 * window yet, which is different from not knowing the deadline of one that is open.
 */
export function deadlineText(deadlineAt: string | null, status: ProcurementStatus): string {
  if (deadlineAt) return formatThaiDate(deadlineAt, { withTime: !DATE_ONLY.test(deadlineAt) });
  return status === 'drafting' ? 'ยังไม่มีกำหนดยื่นข้อเสนอ' : '—';
}
