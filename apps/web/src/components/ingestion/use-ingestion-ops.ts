'use client';

import type { IngestionOps } from '@torfun/types';
import { fetchIngestionOps } from '@/lib/api-ingestion-ops';
import type { LoadError } from '@/lib/api-errors';
import { usePolled } from '@/lib/use-polled';
import { RUN_POLL_MS } from './use-run-summary';

export interface IngestionOpsData {
  ops: IngestionOps | null;
  loading: boolean;
  /** Why the last read failed; polling waits until `reload`. */
  error: LoadError | null;
  updatedAt: Date | null;
  reload: () => void;
}

/**
 * The operations view: live work, timings and the run log. Polls while `live`
 * (the run summary's `running`), and reads again whenever that flips, so the
 * finished run joins the log.
 */
export function useIngestionOps({ live }: { live: boolean }): IngestionOpsData {
  const { data, ...rest } = usePolled(fetchIngestionOps, {
    fallback: 'ไม่สามารถโหลดข้อมูลการทำงานของระบบดึงข้อมูลได้',
    intervalMs: live ? RUN_POLL_MS : null,
    deps: [live],
  });
  return { ops: data, ...rest };
}
