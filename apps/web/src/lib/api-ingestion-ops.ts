import type { IngestionOps } from '@torfun/types';
import { apiFetch, failure } from '@/lib/api';

/** `GET /api/ingestion/ops`: live run, timings, throughput and the run log. */
export async function fetchIngestionOps(): Promise<IngestionOps> {
  const response = await apiFetch('/api/ingestion/ops');
  if (!response.ok) throw await failure(response);
  return (await response.json()) as IngestionOps;
}
