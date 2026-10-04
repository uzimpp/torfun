import { requestNoContent } from './api';

/**
 * What a Site Administrator can do to one procurement record. Each answers 204
 * and records who and when on the API side.
 */

const address = (projectId: string) =>
  `/api/ingestion/procurements/${encodeURIComponent(projectId)}`;

/** Show a held record to officers. */
export function approveProcurement(projectId: string): Promise<void> {
  return requestNoContent(`${address(projectId)}/approve`, { method: 'POST' });
}

/** Drop the record's content and keep a tombstone saying an administrator called it not software. */
export function markNonSoftware(projectId: string): Promise<void> {
  return requestNoContent(`${address(projectId)}/non-software`, { method: 'POST' });
}

/**
 * Delete the record. `allowReimport` says whether a later sweep may bring the
 * project back (no tombstone) or not (a tombstone is written); the API requires
 * it to be stated, so there is no default here.
 */
export function deleteProcurement(projectId: string, allowReimport: boolean): Promise<void> {
  return requestNoContent(`${address(projectId)}?allowReimport=${allowReimport}`, {
    method: 'DELETE',
  });
}
