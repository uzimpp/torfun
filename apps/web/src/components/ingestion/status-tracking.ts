import { MAX_RETRIEVAL_ATTEMPTS, RECORD_DEADLINE_MS, type Procurement } from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';

/**
 * What the ingestion console says about where a record is, as plain functions
 * so the wording and the thresholds can be tested without a DOM or a clock.
 */

/** A record past the pipeline's own deadline is worth a look. */
const OVERDUE_AFTER_MS = RECORD_DEADLINE_MS;

export interface StageDuration {
  label: string;
  overdue: boolean;
}

/**
 * How long a Processing record has been in its current stage, or null for one
 * that is not being processed — a Queued or finished record is not "stuck".
 *
 * Measured from the newest history entry, the moment it entered this stage. The
 * record's own `updatedAt` is the fallback for one whose history is empty.
 */
export function stageDuration(
  record: Pick<Procurement, 'state' | 'statusHistory' | 'updatedAt'>,
  now: Date,
): StageDuration | null {
  if (record.state !== 'Processing') return null;

  const since = record.statusHistory.at(-1)?.at ?? record.updatedAt;
  const elapsed = Math.max(0, now.getTime() - new Date(since).getTime());
  const minutes = Math.floor(elapsed / 60_000);

  const label =
    minutes < 1
      ? 'อยู่ในขั้นนี้ไม่ถึง 1 นาที'
      : minutes < 60
        ? `อยู่ในขั้นนี้ ${minutes} นาที`
        : `อยู่ในขั้นนี้ ${Math.floor(minutes / 60)} ชั่วโมง${minutes % 60 > 0 ? ` ${minutes % 60} นาที` : ''}`;

  return { label, overdue: elapsed > OVERDUE_AFTER_MS };
}

/** "ลองแล้ว 2/3" once a retrieval has been tried at all; nothing before that. */
export function attemptsLabel(attempts: number): string | null {
  return attempts > 0 ? `ลองแล้ว ${attempts}/${MAX_RETRIEVAL_ATTEMPTS}` : null;
}

export interface RunBanner {
  title: string;
  detail: string;
  /** A clock such as "09:06", or null when the server did not say when the run began. */
  elapsed: string | null;
  /** An administrator has asked it to stop and it is finishing the record in hand. */
  stopping: boolean;
}

/**
 * How long, in Thai, at the precision that is useful at that length: seconds
 * under a minute, minutes and seconds under an hour, hours and minutes after.
 * Pure — the caller supplies the difference — so it needs no clock to test.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total} วิ`;
  if (total < 3600) return `${Math.floor(total / 60)} นาที ${total % 60} วิ`;
  return `${Math.floor(total / 3600)} ชม. ${Math.floor((total % 3600) / 60)} นาที`;
}

/** Elapsed time as a clock: "09:06" under an hour, "1:02:03" after. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  const rest = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

/**
 * The live banner's text, or null when no run is in flight.
 *
 * "Queued" counts the retryable errors too: they are waiting for the next
 * attempt just as untouched records are. How long it has run is measured from
 * the start time the server recorded on the lease, not from anything this page
 * remembers, so a reload, a scheduled run, or another browser all agree.
 */
export function runBanner(summary: IngestionSummaryResponse, now: Date): RunBanner | null {
  if (!summary.runInProgress) return null;

  const outcome = (key: keyof IngestionSummaryResponse['byOutcome']) => summary.byOutcome[key] ?? 0;
  return {
    title: summary.stopRequested ? 'กำลังหยุด รอรายการที่ทำอยู่ให้เสร็จ' : 'กำลังรันรอบดึงข้อมูล',
    detail: `ดึง ${outcome('downloading')} · ประมวลผล ${outcome('analysing')} · รอคิว ${outcome('queued') + outcome('error')}`,
    elapsed: summary.runStartedAt
      ? formatClock(now.getTime() - Date.parse(summary.runStartedAt))
      : null,
    stopping: summary.stopRequested,
  };
}
