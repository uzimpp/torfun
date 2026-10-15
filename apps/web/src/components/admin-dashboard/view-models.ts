import type { IngestionFailure } from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';
import { formatThaiDate } from '@/lib/format-date';
import { quotaIsLow } from '@/lib/open-data-quota';
import {
  countTiles,
  outcomeBuckets,
  type BucketKey,
  type CountTile,
  type OutcomeBucket,
} from '@/lib/outcome-buckets';
import { procurementsHref } from '@/components/procurements/procurement-filter-values';

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
  return formatThaiDate(iso);
}

/* ------------------------------------------------------------------------- *
 * KPI tiles
 * ------------------------------------------------------------------------- */

export interface KpiTile extends Omit<CountTile, 'key'> {
  key: CountTile['key'] | 'lastRun';
  href: string;
}

const FAILURE_LOG = '/admin/ingestion#failures';
const INGESTION = '/admin/ingestion';

const KPI_HREF: Partial<Record<KpiTile['key'], string>> = {
  total: procurementsHref(),
  queued: procurementsHref({ outcome: 'queued' }),
  running: procurementsHref({ state: 'Processing' }),
  analysed: procurementsHref({ outcome: 'tor_analysed' }),
  needsReview: procurementsHref({ outcome: 'needs_review' }),
  failed: FAILURE_LOG,
  lastRun: INGESTION,
};

const KPI_COUNTS: CountTile['key'][] = ['total', 'queued', 'running', 'analysed', 'failed'];

const countKpis = (summary: IngestionSummaryResponse, keys: CountTile['key'][]): KpiTile[] =>
  countTiles(summary)
    .filter((tile) => keys.includes(tile.key))
    .map((tile) => ({ ...tile, href: KPI_HREF[tile.key] ?? INGESTION }));

/** The ingestion page's tiles: where every record stands, across all runs, failed last. */
export function recordTiles(summary: IngestionSummaryResponse): KpiTile[] {
  return countKpis(summary, ['queued', 'running', 'analysed', 'needsReview', 'failed']);
}

export function kpiTiles(summary: IngestionSummaryResponse, now: Date = new Date()): KpiTile[] {
  const lastRun = summary.runInProgress
    ? 'กำลังรันอยู่'
    : summary.lastRunAt
      ? timeAgoTh(summary.lastRunAt, now)
      : 'ยังไม่เคยรัน';

  return [
    ...countKpis(summary, KPI_COUNTS),
    {
      key: 'lastRun',
      href: INGESTION,
      label: 'รอบล่าสุด',
      value: lastRun,
      hint: summary.lastRunAt
        ? formatThaiDate(summary.lastRunAt, { withTime: true })
        : 'กดเริ่มรอบดึงข้อมูลได้ที่หน้าติดตาม',
      alert: false,
    },
  ];
}

/* ------------------------------------------------------------------------- *
 * Run state
 * ------------------------------------------------------------------------- */

export interface RunState {
  running: boolean;
  label: string;
  detail: string | null;
}

export function runState(summary: IngestionSummaryResponse, now: Date): RunState {
  if (summary.runInProgress) {
    return {
      running: true,
      label: summary.stopRequested ? 'กำลังหยุดรอบดึงข้อมูล' : 'กำลังดึงข้อมูล…',
      detail: summary.runStartedAt ? `เริ่ม ${timeAgoTh(summary.runStartedAt, now)}` : null,
    };
  }
  return {
    running: false,
    label: summary.lastRunAt
      ? `รอบล่าสุด ${timeAgoTh(summary.lastRunAt, now)}`
      : 'ยังไม่เคยดึงข้อมูล',
    detail: null,
  };
}

/* ------------------------------------------------------------------------- *
 * What needs attention
 * ------------------------------------------------------------------------- */

export type AttentionKey = 'needsReview' | 'failed' | 'refused' | 'quota' | 'unknownCodes';

export interface AttentionChip {
  key: AttentionKey;
  label: string;
  /** Absent where the chip names a condition rather than a number of things. */
  count?: number;
  href: string;
}

const REFUSAL = /HTTP (429|403)\b/;
const UNKNOWN_CODE = /^Unrecognised announcement code "([^"]*)"/;

/** Failures logged since the last run began; none before any run. */
function lastRunFailures(
  summary: IngestionSummaryResponse,
  failures: readonly IngestionFailure[],
): IngestionFailure[] {
  if (!summary.lastRunAt) return [];
  const since = new Date(summary.lastRunAt).getTime();
  return failures.filter((failure) => new Date(failure.at).getTime() >= since);
}

/**
 * The "ต้องดูแล" row, built only from what the summary and the failure log say.
 * A chip with nothing behind it is left out, so an empty list means all is well.
 */
export function attentionChips(
  summary: IngestionSummaryResponse,
  failures: readonly IngestionFailure[],
  now: Date,
): AttentionChip[] {
  const buckets = outcomeBuckets(summary.byOutcome);
  const count = (key: BucketKey) => buckets.find((bucket) => bucket.key === key)!.count;
  const recent = lastRunFailures(summary, failures);

  const refusedCodes = [
    ...new Set(recent.flatMap((failure) => REFUSAL.exec(failure.error)?.[1] ?? [])),
  ].sort();
  const unknownCodes = new Set(
    recent.flatMap((failure) =>
      failure.stage === 'timeline' ? (UNKNOWN_CODE.exec(failure.error)?.[1] ?? []) : [],
    ),
  );

  const chips: Array<AttentionChip | null> = [
    {
      key: 'needsReview',
      label: 'รอตรวจสอบ',
      count: count('needsReview'),
      href: procurementsHref({ outcome: 'needs_review' }),
    },
    {
      key: 'failed',
      label: 'ล้มเหลว',
      count: count('failed'),
      href: procurementsHref({ state: 'Failed' }),
    },
    refusedCodes.length > 0
      ? {
          key: 'refused',
          label: `รอบล้มเหลวเพราะเว็บปฏิเสธ (${refusedCodes.join('/')})`,
          href: FAILURE_LOG,
        }
      : null,
    quotaIsLow(summary.openDataQuota, now)
      ? { key: 'quota', label: 'โควตา open-data ใกล้หมด', href: INGESTION }
      : null,
    {
      key: 'unknownCodes',
      label: 'รหัสไทม์ไลน์ที่ไม่รู้จัก',
      count: unknownCodes.size,
      href: FAILURE_LOG,
    },
  ];

  return chips.filter(
    (chip): chip is AttentionChip => chip !== null && (chip.count === undefined || chip.count > 0),
  );
}
