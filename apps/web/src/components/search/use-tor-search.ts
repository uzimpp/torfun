'use client';

import { useEffect, useState } from 'react';
import type { Procurement } from '@torfun/types';
import { ApiError, fetchProjects } from '@/lib/api';
import { toProjectFilters, type SearchFilterValues } from './search-filter-values';

export const RESULT_LIMIT = 20;

/**
 * Why a search returned nothing, when the reason is not "no matches".
 *
 * `signed_out` and `no_access` are answers, not transport faults. The page has
 * to say which of the two it hit, because one is fixed by signing in and the
 * other requires an administrator to inspect the account or API policy.
 */
export type SearchBlock = 'signed_out' | 'no_access' | 'unreachable' | 'failed';

export interface TorSearchResult {
  items: Procurement[];
  total: number;
  loading: boolean;
  block: SearchBlock | null;
  /** The API's own words, kept so a failure is reported rather than paraphrased. */
  detail: string | null;
}

interface Page {
  items: Procurement[];
  total: number;
  block: SearchBlock | null;
  detail: string | null;
}

function classify(caught: unknown): { block: SearchBlock; detail: string | null } {
  if (!(caught instanceof ApiError)) {
    return { block: 'failed', detail: caught instanceof Error ? caught.message : null };
  }
  if (caught.status === 0) return { block: 'unreachable', detail: caught.message };
  if (caught.status === 401) return { block: 'signed_out', detail: null };
  if (caught.status === 403) return { block: 'no_access', detail: null };
  return { block: 'failed', detail: caught.message };
}

/**
 * Fetches one page of `RESULT_LIMIT` matches against the announcement index.
 * No criteria lists everything the index holds, same as the admin ingestion
 * console does. `page` is 1-indexed, matching what shows in the URL.
 *
 * The caller keys its instance on `(filters, page)` (`SearchResults` does, via
 * `key`) rather than asking this hook to re-target itself — a fresh instance
 * per request means no bookkeeping here for "which fetch is this answer for",
 * and the loading state is correct for free: it starts `null` each time.
 */
export function useTorSearch(filters: SearchFilterValues, page: number): TorSearchResult {
  const [state, setState] = useState<Page | null>(null);

  useEffect(() => {
    let cancelled = false;
    const offset = (page - 1) * RESULT_LIMIT;

    fetchProjects(toProjectFilters(filters, RESULT_LIMIT, offset)).then(
      (response) => {
        if (cancelled) return;
        setState({ items: response.items, total: response.total, block: null, detail: null });
      },
      (caught: unknown) => {
        if (cancelled) return;
        setState({ items: [], total: 0, ...classify(caught) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  return {
    items: state?.items ?? [],
    total: state?.total ?? 0,
    block: state?.block ?? null,
    detail: state?.detail ?? null,
    loading: state === null,
  };
}
