'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Procurement } from '@torfun/types';
import {
  ApiError,
  SessionEndedError,
  fetchSummary,
  type IngestionSummaryResponse,
} from '@/lib/api';
import { fetchRecent } from '@/lib/api-ingestion-recent';
import { SESSION_ENDED_MESSAGE } from '@/components/ingestion/use-ingestion-data';

const POLL_MS = 5000;
export const RECENT_COUNT = 5;

export interface AdminDashboardData {
  summary: IngestionSummaryResponse | null;
  recent: Procurement[];
  loading: boolean;
  error: string | null;
  /** The session cannot be renewed: sign in again, retrying only repeats the refusal. */
  sessionEnded: boolean;
  /** Reload after a failure; polling resumes once a load succeeds. */
  retry: () => void;
}

/**
 * Owns what the administrator's dashboard reads: the queue summary and the most
 * recent activity, fetched together.
 *
 * Refreshes while a run is in flight and otherwise leaves the page alone. It
 * stops polling as soon as anything fails — a poll that repeats a failing call
 * every five seconds cannot recover a session that has ended, and only fills
 * the network log. `retry` starts it again.
 */
export function useAdminDashboardData(): AdminDashboardData {
  const [summary, setSummary] = useState<IngestionSummaryResponse | null>(null);
  const [recent, setRecent] = useState<Procurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  /** Bumped to force a reload without changing anything else. */
  const [refreshKey, setRefreshKey] = useState(0);

  const running = summary?.runInProgress ?? false;

  useEffect(() => {
    // Guards against a slow, older response landing after a newer one.
    let cancelled = false;

    Promise.all([fetchSummary(), fetchRecent(RECENT_COUNT)]).then(
      ([summaryData, recentData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setRecent(recentData.items);
        setError(null);
        setSessionEnded(false);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        const ended = caught instanceof SessionEndedError;
        setSessionEnded(ended);
        setError(
          ended
            ? SESSION_ENDED_MESSAGE
            : caught instanceof ApiError
              ? caught.message
              : 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล',
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!running || error) return;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [running, error]);

  const retry = useCallback(() => {
    setError(null);
    setRefreshKey((key) => key + 1);
  }, []);

  return { summary, recent, loading, error, sessionEnded, retry };
}
