import type { IngestionOps } from '@torfun/types';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { cn } from '@/lib/utils';
import { formatShortDate, formatShortDateTime } from '@/lib/format-date';
import { formatCompact, formatCount } from '@/lib/format-number';
import { dailySeries, formatDuration, perRecordMs, STAGE_LABELS } from './ops-view';

interface Segment {
  name: string;
  value: number;
  fill: string;
}

interface Bar {
  key: string;
  label: string;
  segments: Segment[];
}

const PRIMARY = 'fill-primary';

const DAILY_SERIES = [
  { key: 'completed', name: 'เสร็จสิ้น', bucket: 'analysed' },
  { key: 'held', name: 'รอตรวจสอบ', bucket: 'needsReview' },
  { key: 'failed', name: 'ล้มเหลว', bucket: 'failed' },
] as const;

const BAR_W = 10;
const GAP = 2;
const HEIGHT = 60;

const sum = (bar: Bar) => bar.segments.reduce((total, segment) => total + segment.value, 0);

/**
 * Bars in plain SVG. The caption carries the latest and highest values and the
 * full series sits in a table one click away, so nothing needs a hover to read.
 */
function BarChart({
  id,
  title,
  bars,
  format,
  empty,
  legend,
}: {
  id: string;
  title: string;
  bars: Bar[];
  format: (value: number) => string;
  empty: string;
  legend?: { name: string; dot: string }[];
}) {
  const max = Math.max(0, ...bars.map(sum));
  const latest = bars.at(-1);
  const summary =
    bars.length === 0 || max === 0
      ? empty
      : `ล่าสุด ${format(latest ? sum(latest) : 0)} · สูงสุด ${format(max)}`;
  const width = Math.max(1, bars.length) * (BAR_W + GAP) - GAP;

  return (
    <figure aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2 border-t pt-4">
      <figcaption className="flex flex-col gap-0.5">
        <span id={`${id}-title`} className="text-sm font-medium">
          {title}
        </span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{summary}</span>
      </figcaption>

      {max > 0 ? (
        <>
          <svg
            viewBox={`0 0 ${width} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={`${id}-svg-title ${id}-svg-desc`}
            className="h-20 w-full"
          >
            <title id={`${id}-svg-title`}>{title}</title>
            <desc id={`${id}-svg-desc`}>{summary}</desc>
            {bars.map((bar, index) => {
              let y = HEIGHT;
              return (
                <g key={bar.key}>
                  <title>{`${bar.label}: ${bar.segments
                    .map((segment) =>
                      bar.segments.length > 1
                        ? `${segment.name} ${format(segment.value)}`
                        : format(segment.value),
                    )
                    .join(' · ')}`}</title>
                  {bar.segments.map((segment) => {
                    const h = (segment.value / max) * HEIGHT;
                    y -= h;
                    return (
                      <rect
                        key={segment.name}
                        x={index * (BAR_W + GAP)}
                        y={y}
                        width={BAR_W}
                        height={h}
                        className={segment.fill}
                      />
                    );
                  })}
                </g>
              );
            })}
            <line
              x1={0}
              x2={width}
              y1={HEIGHT}
              y2={HEIGHT}
              className="stroke-border"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="text-muted-foreground flex justify-between gap-4 font-mono text-[11px] tabular-nums">
            <span>{bars[0]?.label}</span>
            <span>{latest?.label}</span>
          </div>
        </>
      ) : null}

      {legend && max > 0 ? (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {legend.map((item) => (
            <li key={item.name} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-sm', item.dot)} aria-hidden="true" />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}

      {bars.length > 0 && max > 0 ? (
        <details className="text-xs">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer">
            ดูเป็นตาราง
          </summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1 font-normal">ช่วง</th>
                {bars[0]!.segments.map((segment) => (
                  <th key={segment.name} className="py-1 text-right font-normal">
                    {segment.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...bars].reverse().map((bar) => (
                <tr key={bar.key}>
                  <td className="py-1 font-mono tabular-nums">{bar.label}</td>
                  {bar.segments.map((segment) => (
                    <td key={segment.name} className="py-1 text-right font-mono tabular-nums">
                      {format(segment.value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </figure>
  );
}

/** Failures by stage as labelled rows: the count is always printed beside its bar. */
function StageBars({ ops }: { ops: IngestionOps }) {
  const rows = ops.failuresByStage;
  const max = Math.max(0, ...rows.map((row) => row.count));
  const total = rows.reduce((all, row) => all + row.count, 0);

  return (
    <figure
      aria-labelledby="stage-failures-title"
      className="flex min-w-0 flex-col gap-2 border-t pt-4"
    >
      <figcaption className="flex flex-col gap-0.5">
        <span id="stage-failures-title" className="text-sm font-medium">
          ข้อผิดพลาดตามขั้นตอน (30 วัน)
        </span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {total > 0 ? `รวม ${formatCount(total)} รายการ` : 'ไม่มีข้อผิดพลาดใน 30 วัน'}
        </span>
      </figcaption>
      {total > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.stage}
              className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
            >
              <span className="truncate">{STAGE_LABELS[row.stage]}</span>
              <span className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                <span
                  className="bg-foreground/60 block h-full rounded-full"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </span>
              <span className="font-mono tabular-nums">{formatCount(row.count)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}

export function OpsCharts({ ops, now }: { ops: IngestionOps; now: Date }) {
  const runs = [...ops.runs].reverse();
  const runBar = (run: (typeof runs)[number], value: number, name: string): Bar => ({
    key: run.id,
    label: formatShortDateTime(run.startedAt),
    segments: [{ name, value, fill: PRIMARY }],
  });

  const perRecord = runs.flatMap((run) => {
    const ms = perRecordMs(run);
    return ms === null ? [] : [runBar(run, ms, 'เวลาต่อรายการ')];
  });

  const daily = dailySeries(ops.throughputDaily, now).map((day) => ({
    key: day.date,
    label: formatShortDate(`${day.date}T00:00:00+07:00`),
    segments: DAILY_SERIES.map((series) => ({
      name: series.name,
      value: day[series.key],
      fill: STATUS_STYLE[series.bucket].fill,
    })),
  }));

  return (
    <div className="grid gap-x-8 gap-y-8 md:grid-cols-2">
      <BarChart
        id="chart-duration"
        title="ระยะเวลาต่อรอบ"
        bars={runs.map((run) => runBar(run, run.durationMs, 'ระยะเวลา'))}
        format={formatDuration}
        empty="ยังไม่มีบันทึกรอบ"
      />
      <BarChart
        id="chart-per-record"
        title="เวลาเฉลี่ยต่อรายการ ต่อรอบ (เวลารอบ ÷ รายการที่ทำ)"
        bars={perRecord}
        format={formatDuration}
        empty="ยังไม่มีรอบที่ทำรายการ"
      />
      <BarChart
        id="chart-daily"
        title="เสร็จสิ้น / รอตรวจสอบ / ล้มเหลว ต่อวัน (30 วัน)"
        bars={daily}
        format={formatCount}
        empty="ไม่มีรายการที่จบใน 30 วัน"
        legend={DAILY_SERIES.map((series) => ({
          name: series.name,
          dot: STATUS_STYLE[series.bucket].dot,
        }))}
      />
      <BarChart
        id="chart-tokens"
        title="โทเคนต่อรอบ"
        bars={runs.map((run) => runBar(run, run.tokens.total, 'โทเคน'))}
        format={formatCompact}
        empty="ยังไม่มีบันทึกรอบ"
      />
      <StageBars ops={ops} />
    </div>
  );
}
