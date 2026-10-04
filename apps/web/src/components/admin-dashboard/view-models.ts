import type { IngestionSummaryResponse } from '@/lib/api';
import {
  countTiles,
  type BucketKey,
  type CountTile,
  type OutcomeBucket,
} from '@/lib/outcome-buckets';

/**
 * Plain functions from API data to what the dashboard draws. Kept apart from
 * the components so the numbers and the wording can be tested without a DOM.
 */

/* ------------------------------------------------------------------------- *
 * Donut geometry
 * ------------------------------------------------------------------------- */

export interface DonutSegment {
  key: BucketKey;
  /** Arc length in percent of the ring's circumference (the ring is 100 units round). */
  length: number;
  /** Where the arc starts, in the same units, measured from twelve o'clock. */
  offset: number;
}

/** The narrowest arc worth drawing; a sliver thinner than this is not visible anyway. */
const MIN_ARC = 0.5;

/**
 * Arcs for a donut whose circumference is 100 units, one per non-empty bucket.
 *
 * `gap` is cut from the end of every arc so neighbouring segments do not touch
 * — the surface shows through instead of two fills meeting. A ring with a single
 * segment has no neighbour, so it is drawn whole rather than with a notch.
 */
export function donutSegments(buckets: OutcomeBucket[], gap: number): DonutSegment[] {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const filled = buckets.filter((bucket) => bucket.count > 0);
  if (total === 0) return [];
  if (filled.length === 1) return [{ key: filled[0]!.key, length: 100, offset: 0 }];

  let offset = 0;
  return filled.map((bucket) => {
    const share = (bucket.count / total) * 100;
    const segment = { key: bucket.key, length: Math.max(share - gap, MIN_ARC), offset };
    offset += share;
    return segment;
  });
}

/* ------------------------------------------------------------------------- *
 * Time
 * ------------------------------------------------------------------------- */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "5 นาทีที่แล้ว" for a recent time, a plain date once it is over a month old.
 * `now` is a parameter so the wording can be tested without a clock.
 */
export function timeAgoTh(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  // A timestamp a few seconds ahead of this machine's clock is skew, not the future.
  const elapsed = Math.max(0, now.getTime() - at.getTime());
  if (elapsed < MINUTE) return 'เมื่อสักครู่';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} นาทีที่แล้ว`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} ชั่วโมงที่แล้ว`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)} วันที่แล้ว`;
  return at.toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

/* ------------------------------------------------------------------------- *
 * KPI tiles
 * ------------------------------------------------------------------------- */

export interface KpiTile extends Omit<CountTile, 'key'> {
  key: CountTile['key'] | 'lastRun';
}

const KPI_COUNTS: CountTile['key'][] = ['total', 'queued', 'running', 'analysed', 'failed'];

export function kpiTiles(summary: IngestionSummaryResponse, now: Date = new Date()): KpiTile[] {
  const lastRun = summary.runInProgress
    ? 'กำลังรันอยู่'
    : summary.lastRunAt
      ? timeAgoTh(summary.lastRunAt, now)
      : 'ยังไม่เคยรัน';

  return [
    ...countTiles(summary).filter((tile) => KPI_COUNTS.includes(tile.key)),
    {
      key: 'lastRun',
      label: 'รอบล่าสุด',
      value: lastRun,
      hint: summary.lastRunAt
        ? new Date(summary.lastRunAt).toLocaleString('th-TH')
        : 'กดเริ่มรอบดึงข้อมูลได้ที่หน้าติดตาม',
      alert: false,
    },
  ];
}
