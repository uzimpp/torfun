'use client';

import { useEffect, useState } from 'react';
import type { Procurement } from '@torfun/types';
import { ApiError, fetchProjects } from '@/lib/api';

export const RESULT_LIMIT = 20;

/**
 * Why a search returned nothing, when the reason is not "no matches".
 *
 * `signed_out` and `no_access` are answers, not faults: the announcement index
 * is served by the ingestion API, which today admits administrators only. The
 * page has to say which of the two it hit, because one is fixed by signing in
 * and the other is not.
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

/** What came back, and which question it answers. */
interface Answer {
  query: string;
  items: Procurement[];
  total: number;
  block: SearchBlock | null;
  detail: string | null;
}

const NOTHING_ASKED: Answer = { query: '', items: [], total: 0, block: null, detail: null };

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
 * Runs one query against the announcement index.
 *
 * The stored answer carries the query it belongs to, which is what makes
 * "loading" a derived fact rather than a flag to keep in step: while the answer
 * on hand is for a different question, the page is still waiting. It also means
 * an empty query needs no state of its own — there is nothing to ask, so the
 * hook reports the starting state without calling the API at all.
 */
export function useTorSearch(query: string): TorSearchResult {
  const [answer, setAnswer] = useState<Answer>(NOTHING_ASKED);

  useEffect(() => {
    if (!query) return;

    // Guards against out-of-order responses: two queries in quick succession
    // must not let the slower, older one paint its results over the newer.
    let cancelled = false;

    fetchProjects({ q: query, limit: RESULT_LIMIT }).then(
      (response) => {
        if (cancelled) return;
        setAnswer({
          query,
          items: response.items,
          total: response.total,
          block: null,
          detail: null,
        });
      },
      (caught: unknown) => {
        if (cancelled) return;
        setAnswer({ query, items: [], total: 0, ...classify(caught) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [query]);

  const settled = answer.query === query;
  const shown = settled ? answer : NOTHING_ASKED;

  return {
    items: shown.items,
    total: shown.total,
    block: shown.block,
    detail: shown.detail,
    loading: query !== '' && !settled,
  };
}
