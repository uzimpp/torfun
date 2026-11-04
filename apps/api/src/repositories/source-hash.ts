import { createHash } from 'node:crypto';
import type { Procurement } from '@torfun/types';

/**
 * A fingerprint of what the announcement feed says about a Procurement.
 *
 * A sweep returns every matching record every time, so "it came back" says
 * nothing. Comparing this says whether the agency's data actually moved. Only
 * what the feed carries goes in: what this system owns (state, outcome,
 * attempts, its reading of the stage, the analysis) must not, or the pipeline's
 * own work would look like an upstream change on the next sweep. Nor what the
 * project detail gives (year, codes, money, sub-agency): the sweep does not
 * carry it, so it would look changed on every sweep.
 */
export function hashSource(record: Procurement): string {
  const owned = [
    record.projectName,
    record.deptName,
    record.announceDate,
    record.purchaseMethodName,
  ];
  return createHash('sha256').update(JSON.stringify(owned)).digest('hex');
}

/**
 * Whether the agency's data for this record differs from what is stored. A
 * record stored with no fingerprint is fingerprinted from its own fields, so
 * a missing one does not mark the record changed.
 */
export function hasUpstreamChange(
  storedHash: string | null,
  existing: Procurement,
  incoming: Procurement,
): boolean {
  return (storedHash ?? hashSource(existing)) !== hashSource(incoming);
}
