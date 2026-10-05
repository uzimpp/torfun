import type { DailyDiscovered, DailyThroughput, RecordTimings, StageFailures } from '@torfun/types';
import { formatShortDate } from '@/lib/format-date';
import { formatCount } from '@/lib/format-number';
import { formatDuration, STAGE_LABELS } from './ops-view';

/**
 * The trend charts' rows, shaped from `GET /api/ingestion/ops` as plain data so
 * the mapping, the value labels and the empty states are testable without a DOM.
 * A chart labels only its peak and its latest point; the table carries the rest.
 */

/** A Bangkok calendar day, "5 ต.ค.". */
export const dayLabel = (date: string) => formatShortDate(`${date}T00:00:00+07:00`);

/** Indexes of the highest and the latest non-zero value. */
export function markIndexes(values: number[]): Set<number> {
  const marks = new Set<number>();
  const max = Math.max(0, ...values);
  if (max === 0) return marks;
  marks.add(values.indexOf(max));
  const last = values.length - 1;
  if (values[last]! > 0) marks.add(last);
  return marks;
}

function withMarks<T>(rows: T[], value: (row: T) => number, format: (value: number) => string) {
  const marks = markIndexes(rows.map(value));
  return rows.map((row, index) => ({
    ...row,
    mark: marks.has(index) ? format(value(row)) : null,
  }));
}

export function discoveredSeries(days: DailyDiscovered[]) {
  const points = withMarks(
    days.map((day) => ({ date: day.date, label: dayLabel(day.date), discovered: day.discovered })),
    (row) => row.discovered,
    formatCount,
  );
  const total = points.reduce((sum, point) => sum + point.discovered, 0);
  return { points, total, empty: total === 0 };
}

export function throughputSeries(days: DailyThroughput[]) {
  const points = withMarks(
    days.map((day) => ({
      date: day.date,
      label: dayLabel(day.date),
      completed: day.completed,
      held: day.held,
      failed: day.failed,
      total: day.completed + day.held + day.failed,
    })),
    (row) => row.total,
    formatCount,
  );
  const totals = { completed: 0, held: 0, failed: 0 };
  for (const point of points) {
    totals.completed += point.completed;
    totals.held += point.held;
    totals.failed += point.failed;
  }
  return { points, totals, empty: totals.completed + totals.held + totals.failed === 0 };
}

export function stageSeries(failures: StageFailures[]) {
  const points = failures
    .filter((row) => row.count > 0)
    .map((row) => ({ stage: row.stage, label: STAGE_LABELS[row.stage], count: row.count }));
  const total = points.reduce((sum, point) => sum + point.count, 0);
  return { points, total, empty: total === 0 };
}

/** The median time per record, or one sentence where nothing was measured. */
export function recordTimingView(timings: RecordTimings) {
  if (timings.sample === 0 || timings.p50Ms === null) {
    return { empty: 'ยังไม่มีรายการที่วัดเวลาได้ใน 30 วัน' } as const;
  }
  return {
    empty: null,
    median: formatDuration(timings.p50Ms),
    split: `ดาวน์โหลด ${formatDuration(timings.downloadP50Ms)} · วิเคราะห์ ${formatDuration(timings.analyseP50Ms)}`,
    sample: `จาก ${formatCount(timings.sample)} รายการ`,
  } as const;
}
