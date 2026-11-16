import type { Procurement } from '@torfun/types';
import { ApiError, apiFetch } from '@/lib/api';

/**
 * The procurements most recently pulled or updated by a run, newest first, for
 * the administrator's dashboard.
 *
 * Its own file rather than another export of `lib/api.ts`, which owns the
 * session handling and is the busiest file in the web app. It shares the same
 * `apiFetch`, so an expired access cookie is renewed here exactly as anywhere
 * else.
 */
export async function fetchRecent(limit = 5): Promise<{ items: Procurement[] }> {
  const response = await apiFetch(`/api/ingestion/recent?limit=${limit}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `Request failed: ${response.status}`, response.status);
  }
  return (await response.json()) as { items: Procurement[] };
}
