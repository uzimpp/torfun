'use client';

import { fetchSummary, type IngestionSummaryResponse } from '@/lib/api';
import type { LoadError } from '@/lib/api-errors';
import { usePolled } from '@/lib/use-polled';

export const RUN_POLL_MS = 5000;

export interface RunSummary {
  summary: IngestionSummaryResponse | null;
  /** The API's `runInProgress`: the one answer to "is a run going". */
  running: boolean;
  loading: boolean;
  error: LoadError | null;
  updatedAt: Date | null;
  reload: () => void;
}

/** The queue summary alone, re-read every few seconds while it says a run is going. */
export function useRunSummary(): RunSummary {
  const { data, error, loading, updatedAt, reload } = usePolled(fetchSummary, {
    fallback: 'ไม่สามารถโหลดสถานะการดึงข้อมูลได้',
    intervalMs: (summary) => (summary?.runInProgress ? RUN_POLL_MS : null),
  });
  return {
    summary: data,
    running: data?.runInProgress ?? false,
    loading,
    error,
    updatedAt,
    reload,
  };
}
