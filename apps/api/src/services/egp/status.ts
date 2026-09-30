import type { ProcurementStatus, StatusSource } from '@torfun/types';

/**
 * Reads upstream's `project_status` — a free-text Thai string — as a
 * `ProcurementStatus`.
 *
 * These are the e-GP stage names as the agency writes them; several fold into
 * one of our six stages (a requisition and a TOR in preparation are both the
 * chance to prepare ahead). The list is unverified against the site's own
 * filter, so it is a map to extend, not a claim to be complete.
 */
const BY_UPSTREAM_STAGE = new Map<string, ProcurementStatus>([
  ['จัดทำ TOR', 'drafting'],
  ['รายงานขอซื้อขอจ้าง', 'drafting'],
  ['หนังสือเชิญชวน/ประกาศเชิญชวน', 'open'],
  ['อนุมัติสั่งซื้อสั่งจ้างและประกาศผู้ชนะการเสนอราคา', 'awarded'],
  ['จัดทำสัญญา/บริหารสัญญา', 'contracted'],
  ['ยกเลิกโครงการ', 'cancelled'],
]);

export interface StatusReading {
  status: ProcurementStatus;
  /** null when there is no reading yet, so nothing claims a source it lacks. */
  source: StatusSource | null;
}

/**
 * The open-data feed's whole vocabulary, as sampled, is the single value
 * `ระหว่างดำเนินการ` ("in progress"), which places a project in no stage. It and
 * anything unrecognised read as `unknown` with no source; the raw string is
 * kept on the record so an unfamiliar value is visible to an administrator.
 */
export function readUpstreamStatus(raw: string | null | undefined): StatusReading {
  const status = raw ? BY_UPSTREAM_STAGE.get(raw.trim()) : undefined;
  return status ? { status, source: 'upstream' } : { status: 'unknown', source: null };
}

/**
 * Whether a bid is still possible. The agency has not asked for one before the
 * invitation stage, and after it the work is awarded, contracted or cancelled.
 */
export function isBiddable(status: ProcurementStatus): boolean {
  return status === 'open';
}
