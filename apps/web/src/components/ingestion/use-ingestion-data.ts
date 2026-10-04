'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  IngestionFailure,
  IngestionOutcome,
  IngestionState,
  Procurement,
  ProcurementStatus,
} from '@torfun/types';
import {
  ApiError,
  SessionEndedError,
  fetchFailures,
  fetchProjects,
  fetchSummary,
  startIngestionRun,
  stopIngestionRun,
  type IngestionSummaryResponse,
  type ProjectFilters,
} from '@/lib/api';

export const PAGE_SIZE = 25;

/** Filter values as the form holds them: strings, empty meaning "no filter". */
export interface FilterValues {
  state: string;
  outcome: string;
  status: string;
  agency: string;
  year: string;
  query: string;
}

export const EMPTY_FILTERS: FilterValues = {
  state: '',
  outcome: '',
  status: '',
  agency: '',
  year: '',
  query: '',
};

function toQuery(filters: FilterValues, page: number): ProjectFilters {
  return {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(filters.state ? { state: filters.state as IngestionState } : {}),
    ...(filters.outcome ? { outcome: filters.outcome as IngestionOutcome } : {}),
    ...(filters.status ? { status: filters.status as ProcurementStatus } : {}),
    ...(filters.agency ? { deptName: filters.agency } : {}),
    ...(filters.year ? { year: Number(filters.year) } : {}),
    ...(filters.query ? { q: filters.query } : {}),
  };
}

export const SESSION_ENDED_MESSAGE = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';

export function messageFor(caught: unknown, fallback: string): string {
  if (caught instanceof SessionEndedError) return SESSION_ENDED_MESSAGE;
  return caught instanceof ApiError ? caught.message : fallback;
}

export interface IngestionData {
  summary: IngestionSummaryResponse | null;
  projects: Procurement[];
  total: number;
  failures: IngestionFailure[];
  loading: boolean;
  error: string | null;
  /**
   * True when the API refused to renew the session — the administrator has to
   * sign in again, and retrying would only repeat the refusal.
   */
  sessionEnded: boolean;
  running: boolean;
  startRun: () => Promise<void>;
  /** Ask the run now going to stop; it finishes the record in hand and leaves the rest queued. */
  stopRun: () => Promise<void>;
  /** Reload after a failure; polling resumes once a load succeeds. */
  retry: () => void;
}

/**
 * Owns everything the ingestion console reads from the API: the three parallel
 * fetches, the poll that runs while a retrieval is in flight, and the run
 * trigger. The component that uses it holds only filter and expansion state.
 */
export function useIngestionData(filters: FilterValues, page: number): IngestionData {
  const [summary, setSummary] = useState<IngestionSummaryResponse | null>(null);
  const [projects, setProjects] = useState<Procurement[]>([]);
  const [total, setTotal] = useState(0);
  const [failures, setFailures] = useState<IngestionFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  /** Bumped to force a reload without changing any filter. */
  const [refreshKey, setRefreshKey] = useState(0);

  const { state, outcome, status, agency, year, query } = filters;

  // Pure fetch — deliberately free of setState so an effect can call it without
  // triggering the cascading renders the React compiler warns about.
  const loadData = useCallback(() => {
    const params = toQuery({ state, outcome, status, agency, year, query }, page);
    return Promise.all([fetchSummary(), fetchProjects(params), fetchFailures()]);
  }, [page, state, outcome, status, agency, year, query]);

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
        setSessionEnded(false);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setSessionEnded(caught instanceof SessionEndedError);
        setError(messageFor(caught, 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล'));
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
  //
  // It also stops while an error stands. Polling through a failure repeats the
  // same failing call every five seconds for as long as the page is open, and
  // for a session that has ended it can never succeed; `retry` restarts it.
  useEffect(() => {
    if (!running || error) return;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), 5000);
    return () => clearInterval(timer);
  }, [running, error]);

  const startRun = useCallback(async () => {
    setError(null);
    try {
      await startIngestionRun();
      setRunning(true);
      setRefreshKey((key) => key + 1);
    } catch (caught) {
      setSessionEnded(caught instanceof SessionEndedError);
      setError(messageFor(caught, 'ไม่สามารถเริ่มรอบการดึงข้อมูลได้'));
    }
  }, []);

  const stopRun = useCallback(async () => {
    setError(null);
    try {
      await stopIngestionRun();
      // Read the summary again now, so the banner shows it is stopping at once.
      setRefreshKey((key) => key + 1);
    } catch (caught) {
      setSessionEnded(caught instanceof SessionEndedError);
      if (caught instanceof ApiError && caught.status === 409) {
        // No run in progress: it had finished by the time the request arrived.
        // Nothing went wrong; reading the summary again takes the banner down.
        setRefreshKey((key) => key + 1);
        return;
      }
      setError(messageFor(caught, 'ไม่สามารถหยุดรอบการดึงข้อมูลได้'));
    }
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setRefreshKey((key) => key + 1);
  }, []);

  return {
    summary,
    projects,
    total,
    failures,
    loading,
    error,
    sessionEnded,
    running,
    startRun,
    stopRun,
    retry,
  };
}
