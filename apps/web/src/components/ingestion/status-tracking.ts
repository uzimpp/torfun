import {
  MAX_RETRIEVAL_ATTEMPTS,
  OUTCOME_LABELS,
  STATE_LABELS,
  type Procurement,
  type StatusChange,
} from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';

/**
 * What the ingestion console says about where a record is, as plain functions
 * so the wording and the thresholds can be tested without a DOM or a clock.
 */

/** A record that has sat in one Processing stage longer than this is worth a look. */
const OVERDUE_AFTER_MS = 5 * 60_000;

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
}

/**
 * The live banner's text, or null when no run is in flight.
 *
 * "Queued" counts the retryable errors too: they are waiting for the next
 * attempt just as untouched records are.
 */
export function runBanner(summary: IngestionSummaryResponse): RunBanner | null {
  if (!summary.runInProgress) return null;

  const outcome = (key: keyof IngestionSummaryResponse['byOutcome']) => summary.byOutcome[key] ?? 0;
  return {
    title: 'กำลังรันรอบดึงข้อมูล',
    detail: `ดึงข้อมูล ${outcome('downloading')} · ประมวลผล ${outcome('analysing')} · รอคิว ${outcome('queued') + outcome('error')}`,
  };
}

export interface ChangeDescription {
  state: string;
  outcome: string;
  time: string;
  /** Present only on a failure, so the reason sits beside the step that failed. */
  detail?: string;
}

/** One history entry, in the console's Thai vocabulary. */
export function describeChange(change: StatusChange): ChangeDescription {
  return {
    state: STATE_LABELS[change.state],
    outcome: OUTCOME_LABELS[change.outcome],
    time: new Date(change.at).toLocaleString('th-TH'),
    ...(change.detail ? { detail: change.detail } : {}),
  };
}
