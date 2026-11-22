import type { Tombstone } from '@torfun/types';
import { apiFetch, failure, requestNoContent } from './api';

/**
 * The dropped-project endpoints, over the same session-renewing `apiFetch` the
 * rest of the console uses.
 */

export async function fetchTombstones(): Promise<Tombstone[]> {
  const response = await apiFetch('/api/ingestion/tombstones');
  if (!response.ok) throw await failure(response);
  return ((await response.json()) as { items: Tombstone[] }).items;
}

/** Remove the tombstone only: the project may come back on the next sweep, with no download now. */
export function removeTombstone(projectId: string): Promise<void> {
  return requestNoContent(`/api/ingestion/tombstones/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}

/** Remove the tombstone and queue one fresh read: costs a download from the upstream site. */
export function restoreTombstone(projectId: string): Promise<void> {
  return requestNoContent(`/api/ingestion/tombstones/${encodeURIComponent(projectId)}/restore`, {
    method: 'POST',
  });
}
