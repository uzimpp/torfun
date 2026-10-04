'use client';

import type { Procurement } from '@torfun/types';
import { fetchProjects } from '@/lib/api';
import type { LoadError } from '@/lib/api-errors';
import { usePolled } from '@/lib/use-polled';
import { toProjectQuery, type ProcurementListFilters } from './procurement-filter-values';

export const LIST_POLL_MS = 5000;

export interface ProcurementList {
  items: Procurement[];
  total: number;
  /** True until the first page arrives; later reloads keep the old rows on screen. */
  loading: boolean;
  error: LoadError | null;
  /** Read again: after a failure, or after an action moved a record. */
  reload: () => void;
}

/**
 * One page of the admin procurement list. `live` re-reads it every few seconds
 * (pass the run's `running`), and stops while an error stands.
 */
export function useProcurementList(
  filters: ProcurementListFilters,
  page: number,
  { live = false }: { live?: boolean } = {},
): ProcurementList {
  const { q, state, outcome, status, agency, year } = filters;
  const { data, error, loading, reload } = usePolled(
    () => fetchProjects(toProjectQuery({ q, state, outcome, status, agency, year }, page)),
    {
      fallback: 'ไม่สามารถโหลดรายการประกาศได้',
      intervalMs: live ? LIST_POLL_MS : null,
      deps: [q, state, outcome, status, agency, year, page],
    },
  );

  return { items: data?.items ?? [], total: data?.total ?? 0, loading, error, reload };
}
