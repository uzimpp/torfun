import { IngestionOutcome, OUTCOME_LABELS } from '@torfun/types';
import { cn } from '@/lib/utils';
import { DISCLOSURE, StatValue, TABLE_HEAD } from '@/components/admin/admin-ui';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { shareOf, type OutcomeBucket } from '@/lib/outcome-buckets';
import { donutSegments } from './view-models';
import { formatCount } from '@/lib/format-number';

/**
 * A ring is 100 units round when its radius is 100 / 2π, which lets an arc's
 * length be written straight in percent.
 */
const RADIUS = 100 / (2 * Math.PI);
const STROKE = 5;
/** Surface showing between neighbouring arcs, in the same units — about 2px at this size. */
const GAP = 0.6;

/**
 * Where the queue stands, as one ring split into six outcome buckets.
 *
 * The ring is the overview, not the data: every bucket is also a legend row
 * with its name, count and percent, and the ten outcomes behind them are a
 * table one click away. So nothing here depends on telling colours apart, and
 * nothing is readable only by hovering a segment.
 */
export function OutcomeDonut({
  buckets,
  total,
  byOutcome,
}: {
  buckets: OutcomeBucket[];
  total: number;
  /** The ten outcomes for the table view; omitted, the table is not offered. */
  byOutcome?: Partial<Record<IngestionOutcome, number>>;
}) {
  const segments = donutSegments(buckets, GAP);
  const bucketOf = (key: string) => buckets.find((bucket) => bucket.key === key);

  if (total === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center">
        <div className="border-muted size-32 rounded-full border-[10px]" aria-hidden="true" />
        <p className="text-sm font-medium">ยังไม่มีประกาศในระบบ</p>
        <p className="text-muted-foreground max-w-xs text-xs">
          เริ่มรอบดึงข้อมูลที่หน้าติดตาม แล้วสัดส่วนผลการประมวลผลจะแสดงที่นี่
        </p>
      </div>
    );
  }

  const description = `สัดส่วนผลการประมวลผลจากทั้งหมด ${formatCount(total)} รายการ: ${buckets
    .map((bucket) => `${bucket.label} ${formatCount(bucket.count)}`)
    .join(', ')}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col">
        <div className="relative size-44 shrink-0">
          <svg
            viewBox="0 0 42 42"
            role="img"
            aria-label={description}
            className="size-full -rotate-90"
          >
            <circle
              cx="21"
              cy="21"
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-muted"
            />
            {segments.map((segment) => {
              const bucket = bucketOf(segment.key)!;
              return (
                <circle
                  key={segment.key}
                  cx="21"
                  cy="21"
                  r={RADIUS}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeDasharray={`${segment.length} ${100 - segment.length}`}
                  strokeDashoffset={-segment.offset}
                  className={STATUS_STYLE[segment.key].stroke}
                >
                  <title>{`${bucket.label} ${formatCount(bucket.count)} (${shareOf(bucket.count, total)}%)`}</title>
                </circle>
              );
            })}
          </svg>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            aria-hidden="true"
          >
            <StatValue>{formatCount(total)}</StatValue>
            <span className="text-muted-foreground text-xs">รายการ</span>
          </div>
        </div>

        <ul aria-label="สัดส่วนตามผลการประมวลผล" className="grid w-full gap-2">
          {buckets.map((bucket) => {
            const style = STATUS_STYLE[bucket.key];
            const Icon = style.icon;
            return (
              <li
                key={bucket.key}
                className="flex items-center gap-3 border-b border-dashed pb-2 text-sm last:border-b-0 last:pb-0"
              >
                <span
                  className={cn(
                    'size-3 shrink-0 rounded-sm',
                    bucket.count === 0 ? 'bg-muted-foreground/30' : style.dot,
                  )}
                  aria-hidden="true"
                />
                <Icon
                  className={cn('text-muted-foreground size-4 shrink-0', style.iconClass)}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{bucket.label}</span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    bucket.count === 0 && 'text-muted-foreground',
                  )}
                >
                  {formatCount(bucket.count)}
                </span>
                <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">
                  {shareOf(bucket.count, total)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {byOutcome ? (
        <details className="group text-sm">
          <summary className={DISCLOSURE}>
            ดูเป็นตาราง ({IngestionOutcome.options.length} ผลการประมวลผล)
          </summary>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">จำนวนประกาศแยกตามผลการประมวลผล</caption>
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className={cn(TABLE_HEAD, 'py-1.5')}>
                  ผลการประมวลผล
                </th>
                <th scope="col" className={cn(TABLE_HEAD, 'py-1.5 text-right')}>
                  จำนวน
                </th>
              </tr>
            </thead>
            <tbody>
              {IngestionOutcome.options.map((outcome) => (
                <tr key={outcome} className="border-b last:border-b-0">
                  <td className="py-1.5">{OUTCOME_LABELS[outcome]}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatCount(byOutcome[outcome] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}
