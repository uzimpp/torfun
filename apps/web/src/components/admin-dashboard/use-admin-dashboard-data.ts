'use client';

import type { IngestionFailure, Procurement } from '@torfun/types';
import { fetchFailures, fetchSummary, type IngestionSummaryResponse } from '@/lib/api';
import type { LoadError } from '@/lib/api-errors';
import { fetchRecent } from '@/lib/api-ingestion-recent';
import { usePolled } from '@/lib/use-polled';

const POLL_MS = 5000;
export const RECENT_COUNT = 5;

export interface AdminDashboardData {
  summary: IngestionSummaryResponse | null;
  recent: Procurement[];
  /** The failure log, newest first; the attention row reads the last run's share of it. */
  failures: IngestionFailure[];
  /**
   * When this data was fetched — the moment "5 minutes ago" is measured from.
   * Null until the first load; held in state because reading the clock while
   * rendering would make the page's output depend on when it happened to render.
   */
  asOf: Date | null;
  loading: boolean;
  error: LoadError | null;
  /** Read again: after a failure (polling resumes once it succeeds) or after a decision here. */
  retry: () => void;
}

/**
 * Owns what the administrator's dashboard reads: the queue summary, the most
 * recent activity and the failure log, fetched together.
 *
 * Refreshes while a run is in flight and otherwise leaves the page alone. It
 * stops polling as soon as anything fails — a poll that repeats a failing call
 * every five seconds cannot recover a session that has ended, and only fills
 * the network log. `retry` starts it again.
 */
export function useAdminDashboardData(): AdminDashboardData {
  const { data, error, loading, updatedAt, reload } = usePolled(
    async () => {
      const [summary, recent, failures] = await Promise.all([
        fetchSummary(),
        fetchRecent(RECENT_COUNT),
        fetchFailures(),
      ]);
      return { summary, recent: recent.items, failures: failures.items };
    },
    {
      fallback: 'เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล',
      intervalMs: (last) => (last?.summary.runInProgress ? POLL_MS : null),
    },
  );

  return {
    summary: data?.summary ?? null,
    recent: data?.recent ?? [],
    failures: data?.failures ?? [],
    asOf: updatedAt,
    loading,
    error,
    retry: reload,
  };
}
