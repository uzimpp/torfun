import { OUTCOME_LABELS, type IngestionOutcome } from '@torfun/types';

/**
 * The ten pipeline outcomes are too fine to read as a chart, so the dashboard
 * groups them into six by what an administrator would do about each.
 *
 * The grouping is a presentation choice and lives here, not in the shared
 * types: the outcomes themselves and their Thai labels stay in
 * `@torfun/types`, and the table on the ingestion page still shows all ten.
 */

export type BucketKey = 'analysed' | 'notSoftware' | 'noTor' | 'failed' | 'queued' | 'running';

export interface OutcomeBucket {
  key: BucketKey;
  label: string;
  count: number;
  /** The outcomes this bucket adds up, so the legend can say what is inside it. */
  outcomes: IngestionOutcome[];
}

/** Fixed order: it is also the order of the chart's segments and its legend. */
const BUCKETS: Array<Omit<OutcomeBucket, 'count'>> = [
  { key: 'analysed', label: 'วิเคราะห์แล้ว', outcomes: ['tor_analysed'] },
  { key: 'notSoftware', label: OUTCOME_LABELS.not_software, outcomes: ['not_software'] },
  { key: 'noTor', label: 'ไม่มี TOR', outcomes: ['no_tor_package', 'no_tor_in_archive'] },
  { key: 'failed', label: 'ล้มเหลว', outcomes: ['analysis_failed', 'error', 'abandoned'] },
  { key: 'queued', label: 'รอ', outcomes: ['queued'] },
  { key: 'running', label: 'กำลังทำ', outcomes: ['downloading', 'analysing'] },
];

/**
 * Sparse in, complete out: the API only reports outcomes that occur, and a
 * bucket that is missing from a chart reads as "not tracked" rather than zero.
 */
export function outcomeBuckets(
  byOutcome: Partial<Record<IngestionOutcome, number>>,
): OutcomeBucket[] {
  return BUCKETS.map((bucket) => ({
    ...bucket,
    count: bucket.outcomes.reduce((sum, outcome) => sum + (byOutcome[outcome] ?? 0), 0),
  }));
}

/** The bucket an outcome is counted in, for labelling one procurement the way the chart does. */
export function bucketOfOutcome(outcome: IngestionOutcome): BucketKey {
  return BUCKETS.find((bucket) => bucket.outcomes.includes(outcome))!.key;
}

/** Whole-number percent of the total; 0 rather than NaN when there is nothing yet. */
export function shareOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
