'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IngestionFailure, IngestionRecord, IngestionState } from '@torfun/types';
import {
  ApiError,
  fetchFailures,
  fetchProjects,
  fetchSummary,
  startIngestionRun,
  type IngestionSummaryResponse,
  type ProjectFilters,
} from '@/lib/api';

export const PAGE_SIZE = 25;

/** Filter values as the form holds them: strings, empty meaning "no filter". */
export interface FilterValues {
  state: string;
  agency: string;
  year: string;
  eBidding: string;
  query: string;
}

export const EMPTY_FILTERS: FilterValues = {
  state: '',
  agency: '',
  year: '',
  eBidding: '',
  query: '',
};

function toQuery(filters: FilterValues, page: number): ProjectFilters {
  return {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(filters.state ? { state: filters.state as IngestionState } : {}),
    ...(filters.agency ? { deptName: filters.agency } : {}),
    ...(filters.year ? { year: Number(filters.year) } : {}),
    ...(filters.eBidding ? { eBidding: filters.eBidding === 'true' } : {}),
    ...(filters.query ? { q: filters.query } : {}),
  };
}

export interface IngestionData {
  summary: IngestionSummaryResponse | null;
  projects: IngestionRecord[];
  total: number;
  failures: IngestionFailure[];
  loading: boolean;
  error: string | null;
  running: boolean;
  startRun: () => Promise<void>;
}

/**
 * Owns everything the ingestion console reads from the API: the three parallel
 * fetches, the poll that runs while a retrieval is in flight, and the run
 * trigger. The component that uses it holds only filter and expansion state.
 */
export function useIngestionData(filters: FilterValues, page: number): IngestionData {
  const [summary, setSummary] = useState<IngestionSummaryResponse | null>(null);
  const [projects, setProjects] = useState<IngestionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [failures, setFailures] = useState<IngestionFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  /** Bumped to force a reload without changing any filter. */
  const [refreshKey, setRefreshKey] = useState(0);

  const { state, agency, year, eBidding, query } = filters;

  // Pure fetch — deliberately free of setState so an effect can call it without
  // triggering the cascading renders the React compiler warns about.
  const loadData = useCallback(() => {
    const params = toQuery({ state, agency, year, eBidding, query }, page);
    return Promise.all([fetchSummary(), fetchProjects(params), fetchFailures()]);
  }, [page, state, agency, year, eBidding, query]);

  useEffect(() => {
    // `cancelled` guards against out-of-order responses: changing a filter
    // twice quickly must not let the slower, older request win.
    let cancelled = false;

    loadData().then(
      ([summaryData, projectData, failureData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setProjects(projectData.items);
        setTotal(projectData.total);
        setFailures(failureData.items);
        setRunning(summaryData.runInProgress);
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล',
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [loadData, refreshKey]);

  // A run takes minutes, so poll while one is in flight. `runInProgress` comes
  // from the API, so this stops when the run actually ends rather than when the
  // queue momentarily shows nothing Processing.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), 5000);
    return () => clearInterval(timer);
  }, [running]);

  const startRun = useCallback(async () => {
    setError(null);
    try {
      await startIngestionRun(true);
      setRunning(true);
      setRefreshKey((key) => key + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ไม่สามารถเริ่มรอบการดึงข้อมูลได้');
    }
  }, []);

  return { summary, projects, total, failures, loading, error, running, startRun };
}
