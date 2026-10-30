'use client';

import { useCallback, useRef, useState } from 'react';
import type { IngestionFailure } from '@torfun/types';
import {
  ApiError,
  fetchFailures,
  startIngestionRun,
  stopIngestionRun,
  type IngestionSummaryResponse,
} from '@/lib/api';
import { toLoadError, type LoadError } from '@/lib/api-errors';
import { usePolled } from '@/lib/use-polled';
import { RUN_POLL_MS, useRunSummary } from './use-run-summary';

export type RunAction = 'start' | 'stop';

export interface IngestionRun {
  summary: IngestionSummaryResponse | null;
  failures: IngestionFailure[];
  loading: boolean;
  /** Why the summary or failure log could not be read; polling waits until `reload`. */
  error: LoadError | null;
  /** Which control was refused last, and why. */
  actionError: { action: RunAction; error: LoadError } | null;
  running: boolean;
  /** A start has been sent and not yet answered. */
  starting: boolean;
  /** When the summary was last read, for "อัปเดตเมื่อ …". */
  updatedAt: Date | null;
  startRun: () => Promise<void>;
  /** Ask the run to stop; it finishes the records in hand and leaves the rest queued. */
  stopRun: () => Promise<void>;
  reload: () => void;
}

/**
 * The run side of ingestion: the summary and failure log, polled while the
 * summary says a run is going, and the start and stop controls.
 */
export function useIngestionRun(): IngestionRun {
  const run = useRunSummary();
  const log = usePolled(fetchFailures, {
    fallback: 'ไม่สามารถโหลดบันทึกข้อผิดพลาดได้',
    intervalMs: run.running && !run.error ? RUN_POLL_MS : null,
  });
  const [actionError, setActionError] = useState<IngestionRun['actionError']>(null);
  const [starting, setStarting] = useState(false);
  /** A ref, not state: a second press in the same tick must see the first. */
  const startingRef = useRef(false);
  const { reload: reloadSummary } = run;
  const { reload: reloadLog } = log;

  const startRun = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setActionError(null);
    try {
      await startIngestionRun();
      reloadSummary();
    } catch (caught) {
      setActionError({
        action: 'start',
        error: toLoadError(caught, 'ไม่สามารถเริ่มรอบการดึงข้อมูลได้'),
      });
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [reloadSummary]);

  const stopRun = useCallback(async () => {
    setActionError(null);
    try {
      await stopIngestionRun();
      reloadSummary();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        // The run had already finished; reading the summary again takes the banner down.
        reloadSummary();
        return;
      }
      setActionError({
        action: 'stop',
        error: toLoadError(caught, 'ไม่สามารถหยุดรอบการดึงข้อมูลได้'),
      });
    }
  }, [reloadSummary]);

  const reload = useCallback(() => {
    reloadSummary();
    reloadLog();
  }, [reloadSummary, reloadLog]);

  return {
    summary: run.summary,
    failures: log.data?.items ?? [],
    loading: run.loading,
    error: run.error ?? log.error,
    actionError,
    running: run.running,
    starting,
    updatedAt: run.updatedAt,
    startRun,
    stopRun,
    reload,
  };
}
