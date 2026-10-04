import { type IngestionOutcome } from '@torfun/types';
import type { IngestionSummaryResponse } from './api';

/**
 * The ten pipeline outcomes are too fine to read as a chart or a row of tiles,
 * so both admin pages group them into six by what an administrator would do
 * about each. This is the only place that grouping is defined.
 *
 * It is a presentation choice, so it lives in the web app, not in the shared
 * types: the outcomes themselves and their Thai labels stay in
 * `@torfun/types`, and the table on the ingestion page still shows all ten.
 */

export type BucketKey =
  'analysed' | 'needsReview' | 'noTor' | 'failed' | 'queued' | 'running';

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
  { key: 'needsReview', label: 'รอตรวจสอบ', outcomes: ['needs_review'] },
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

export interface CountTile {
  key: 'total' | BucketKey;
  label: string;
  value: string;
  hint: string;
  /** Only set when there is something to look at; an all-zero tile stays neutral. */
  alert: boolean;
}

const thai = (n: number) => n.toLocaleString('th-TH');

/**
 * The tiles both admin pages draw: the total, then each bucket in pipeline order.
 * Every number comes from `outcomeBuckets`, so the pages cannot disagree.
 */
export function countTiles(summary: IngestionSummaryResponse): CountTile[] {
  const buckets = outcomeBuckets(summary.byOutcome);
  const bucket = (key: BucketKey) => buckets.find((b) => b.key === key)!;
  const retrying = summary.byOutcome.error ?? 0;
  const failed = bucket('failed').count;
  const tile = (key: BucketKey, hint: string, alert = false): CountTile => ({
    key,
    label: bucket(key).label,
    value: thai(bucket(key).count),
    hint,
    alert,
  });

  return [
    {
      key: 'total',
      label: 'ประกาศทั้งหมด',
      value: thai(summary.total),
      hint: 'ไม่ซ้ำตามรหัสโครงการ',
      alert: false,
    },
    tile('queued', 'ยังไม่ได้ดึงเอกสาร'),
    tile('running', 'ดึงเอกสารหรือให้ AI อ่าน TOR'),
    tile('analysed', `ได้ไฟล์ TOR ${thai(summary.torDocumentsRetrieved)} ไฟล์`),
    tile('needsReview', 'AI ไม่แน่ใจ รอผู้ดูแลตัดสิน'),
    tile('noTor', 'ต้นทางไม่มีเอกสาร TOR'),
    tile(
      'failed',
      `บันทึกข้อผิดพลาด ${thai(summary.failureCount)} รายการ` +
        (retrying > 0 ? ` · รอลองใหม่ ${thai(retrying)}` : ''),
      failed > 0,
    ),
  ];
}
