import type { CurrentDeadline, ProcurementStatus } from '@torfun/types';
import { formatThaiDate } from './format-date';

/** A deadline stored with no stated time is midnight UTC (see the API's `convertDateToISO`). */
const DATE_ONLY = /T00:00:00\.000Z$/;

export function deadlineLabel(deadline: CurrentDeadline | null): string {
  return deadline?.kind === 'comments' ? 'ปิดรับฟังความคิดเห็น' : 'กำหนดยื่นข้อเสนอ';
}

/**
 * How a deadline (`currentDeadline`) reads to an officer. A project still in
 * drafting has no bid window yet, which is different from not knowing the
 * deadline of one that is open.
 */
export function deadlineText(deadline: CurrentDeadline | null, status: ProcurementStatus): string {
  if (deadline) return formatThaiDate(deadline.at, { withTime: !DATE_ONLY.test(deadline.at) });
  return status === 'drafting' ? 'ยังไม่มีกำหนดยื่นข้อเสนอ' : '—';
}
