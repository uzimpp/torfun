import type { ProcurementStatus } from '@torfun/types';

/**
 * Whether a bid is still possible. The agency has not asked for one before the
 * invitation stage, and after it the work is awarded, contracted or cancelled.
 */
export function isBiddable(status: ProcurementStatus): boolean {
  return status === 'open';
}
