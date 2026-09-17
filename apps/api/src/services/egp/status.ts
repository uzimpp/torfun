import { STATUS_LABELS, type ProcurementStatus } from '@torfun/types';

/**
 * Reads upstream's `project_status` — a free-text Thai string — as a
 * `ProcurementStatus`.
 *
 * The stage names are the labels themselves, so the map is derived from
 * `STATUS_LABELS` rather than repeated here: one list to keep in step with
 * upstream instead of two that can silently disagree.
 */
const BY_LABEL = new Map<string, ProcurementStatus>(
  (Object.entries(STATUS_LABELS) as [ProcurementStatus, string][])
    .filter(([status]) => status !== 'unknown')
    .map(([status, label]) => [label, status]),
);

/**
 * An unrecognised stage becomes `unknown` rather than being guessed at. The
 * caller is expected to surface that, not swallow it — a stage this list does
 * not name means upstream changed, which an administrator should see.
 */
export function toProcurementStatus(raw: string | null | undefined): ProcurementStatus {
  if (!raw) return 'unknown';
  return BY_LABEL.get(raw.trim()) ?? 'unknown';
}

/**
 * Whether a bid is still possible. The agency has not asked for one before the
 * invitation stage, and after it the work is awarded, contracted or cancelled.
 */
export function isBiddable(status: ProcurementStatus): boolean {
  return status === 'invitation';
}
