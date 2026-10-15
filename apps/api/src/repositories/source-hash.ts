import { createHash } from 'node:crypto';
import type { Procurement } from '@torfun/types';

/**
 * A fingerprint of everything the agency owns on a Procurement.
 *
 * A sweep returns every matching record every time, so "it came back" says
 * nothing. Comparing this says whether the agency's data actually moved. Only
 * what upstream publishes goes in: what this system owns (state, outcome,
 * attempts, its reading of the stage, the analysis) must not, or the pipeline's
 * own work would look like an upstream change on the next sweep. Nor what the
 * project detail gives (year, codes, sub-agency): the sweep does not carry it,
 * so it would look changed on every sweep.
 */
export function hashSource(record: Procurement): string {
  const owned = [
    record.projectName,
    record.deptName,
    record.announceDate,
    record.projectTypeName,
    record.purchaseMethodName,
    record.projectMoney,
    record.priceBuild,
  ];
  return createHash('sha256').update(JSON.stringify(owned)).digest('hex');
}

/**
 * Whether the agency's data for this record differs from what is stored. A
 * record stored before fingerprints existed is fingerprinted from its own
 * fields, so introducing them does not mark every record changed at once.
 */
export function hasUpstreamChange(existing: Procurement, incoming: Procurement): boolean {
  return (existing.sourceHash ?? hashSource(existing)) !== hashSource(incoming);
}
