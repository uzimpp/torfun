import { E_BIDDING_METHOD, IN_SCOPE_GOODS_IDS } from './constants';

/** Why a feed row was kept out of the queue, or `admit` where it was not. */
export type Admission = 'admit' | 'not_registry' | 'not_e_bidding' | 'tombstoned';

/** What admission looks at in a feed row. The title is deliberately not here. */
export interface AdmissionRow {
  projectId: string;
  deptName: string;
  purchaseMethodName: string | undefined;
}

/**
 * Whether a feed row becomes a record.
 *
 * Three facts, checked in this order so each rejection names the first reason:
 * the agency is one the Source Registry names (an exact match against what its
 * dept_code resolved to), the tender is e-bidding, and an administrator or the
 * model has not already ruled it out (its tombstone). Whether the work is
 * software is not decided here — that is the document's job, after retrieval.
 */
export function admit(
  row: AdmissionRow,
  registryNames: ReadonlySet<string>,
  tombstoned: ReadonlySet<string>,
): Admission {
  if (!registryNames.has(row.deptName)) return 'not_registry';
  if (row.purchaseMethodName !== E_BIDDING_METHOD) return 'not_e_bidding';
  if (tombstoned.has(row.projectId)) return 'tombstoned';
  return 'admit';
}

/**
 * Whether a project's Goods Category is one software work is filed under. An
 * unknown category is admitted. The category limits scope; only the TOR decides
 * whether the work is software (ADR-0021).
 */
export function goodsInScope(goodsId: string | null): boolean {
  return goodsId === null || IN_SCOPE_GOODS_IDS.has(goodsId);
}
