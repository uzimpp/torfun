'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { DailyDiscovered, DailyThroughput, StageFailures } from '@torfun/types';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatCompact, formatCount } from '@/lib/format-number';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { ChartCard } from './chart-card';
import { discoveredSeries, stageSeries, throughputSeries } from './trend-series';

const PLOT = 'aspect-auto h-56 w-full tabular-nums';
const MARGIN = { top: 22, right: 12, bottom: 0, left: 0 };
const X_AXIS = { tickLine: false, axisLine: false, tickMargin: 8, minTickGap: 20 } as const;
const Y_AXIS = { tickLine: false, axisLine: false, width: 44, allowDecimals: false } as const;
const VALUE_LABEL = {
  position: 'top',
  offset: 8,
  fontSize: 12,
  className: 'fill-foreground',
} as const;

function useChartId() {
  return useId().replace(/[^a-zA-Z0-9]/g, '');
}

type Row = Record<string, unknown>;

/** The hover card: every series at that point in Anuphan, with figures that hold their width. */
function TrendTooltip({
  active,
  payload,
  label,
  config,
  format,
  total,
}: Partial<TooltipContentProps> & {
  config: ChartConfig;
  format: (value: number, row: Row) => string;
  total?: (row: Row) => string;
}) {
  const items = (payload ?? []).filter((item) => typeof item.value === 'number');
  if (!active || items.length === 0) return null;
  const row = items[0]!.payload as Row;

  return (
    <div className="bg-popover text-popover-foreground grid min-w-40 gap-1.5 rounded-lg border px-3 py-2 text-xs tabular-nums shadow-lg">
      <div className="font-medium">{label}</div>
      {items.map((item) => {
        const key = String(item.dataKey);
        return (
          <div key={key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[2px]"
              style={{ background: `var(--color-${key})` }}
            />
            <span className="text-muted-foreground flex-1">{config[key]?.label ?? key}</span>
            <span className="text-foreground font-medium">{format(item.value as number, row)}</span>
          </div>
        );
      })}
      {total ? (
        <div className="flex justify-between gap-2 border-t pt-1.5">
          <span className="text-muted-foreground">รวม</span>
          <span className="font-medium">{total(row)}</span>
        </div>
      ) : null}
    </div>
  );
}

function tooltip(
  config: ChartConfig,
  format: (value: number, row: Row) => string,
  total?: (row: Row) => string,
) {
  return (
    <ChartTooltip
      cursor={{ fillOpacity: 0.5 }}
      content={(props) => <TrendTooltip {...props} config={config} format={format} total={total} />}
    />
  );
}

const legend = (
  <ChartLegend
    itemSorter={null}
    content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />}
  />
);

export function DiscoveredChart({
  days,
  className,
}: {
  days: DailyDiscovered[];
  className?: string;
}) {
  const id = useChartId();
  const reduced = usePrefersReducedMotion();
  const series = discoveredSeries(days);
  const config = {
    discovered: { label: 'ประกาศที่พบ', color: 'var(--primary)' },
  } satisfies ChartConfig;

  return (
    <ChartCard
      id={`${id}-discovered`}
      title="ประกาศที่พบต่อวัน (30 วัน)"
      subtitle="ประกาศจากหน่วยงานในทะเบียน นับตามวันที่ระบบพบครั้งแรก"
      headline={{ value: formatCount(series.total), caption: 'รวม 30 วัน' }}
      empty={series.empty ? 'ไม่พบประกาศใหม่ใน 30 วัน' : null}
      rows={[...series.points].reverse()}
      rowKey={(row) => row.date}
      columns={[
        { header: 'วันที่', cell: (row) => row.label },
        { header: 'ประกาศที่พบ', cell: (row) => formatCount(row.discovered) },
      ]}
      className={className}
    >
      <ChartContainer config={config} className={PLOT}>
        <AreaChart data={series.points} margin={MARGIN} accessibilityLayer>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-discovered)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-discovered)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...X_AXIS} />
          <YAxis {...Y_AXIS} tickFormatter={formatCompact} />
          {tooltip(config, (value) => formatCount(value))}
          <Area
            dataKey="discovered"
            type="monotone"
            stroke="var(--color-discovered)"
            strokeWidth={2}
            fill={`url(#${id}-fill)`}
            activeDot={{ r: 4 }}
            isAnimationActive={!reduced}
          >
            <LabelList dataKey="mark" {...VALUE_LABEL} />
          </Area>
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  );
}

const THROUGHPUT_CONFIG = {
  completed: { label: 'เสร็จสิ้น', theme: STATUS_STYLE.analysed.chart },
  held: { label: 'รอตรวจสอบ', theme: STATUS_STYLE.needsReview.chart },
  failed: { label: 'ล้มเหลว', theme: STATUS_STYLE.failed.chart },
} satisfies ChartConfig;

export function ThroughputChart({
  days,
  className,
}: {
  days: DailyThroughput[];
  className?: string;
}) {
  const id = useChartId();
  const reduced = usePrefersReducedMotion();
  const series = throughputSeries(days);
  const { completed, held, failed } = series.totals;

  return (
    <ChartCard
      id={`${id}-throughput`}
      title="ผลการประมวลผลต่อวัน"
      subtitle="รายการที่อ่าน TOR จบในแต่ละวัน แยกตามผล (30 วัน)"
      headline={{ value: formatCount(completed + held + failed), caption: 'รวม 30 วัน' }}
      empty={series.empty ? 'ไม่มีรายการที่ประมวลผลจบใน 30 วัน' : null}
      rows={[...series.points].reverse()}
      rowKey={(row) => row.date}
      columns={[
        { header: 'วันที่', cell: (row) => row.label },
        { header: 'เสร็จสิ้น', cell: (row) => formatCount(row.completed) },
        { header: 'รอตรวจสอบ', cell: (row) => formatCount(row.held) },
        { header: 'ล้มเหลว', cell: (row) => formatCount(row.failed) },
      ]}
      className={className}
    >
      <ChartContainer config={THROUGHPUT_CONFIG} className={PLOT}>
        <BarChart data={series.points} margin={MARGIN} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...X_AXIS} />
          <YAxis {...Y_AXIS} tickFormatter={formatCompact} />
          {tooltip(
            THROUGHPUT_CONFIG,
            (value) => formatCount(value),
            (row) => formatCount(row.total as number),
          )}
          {legend}
          <Bar
            dataKey="completed"
            stackId="day"
            fill="var(--color-completed)"
            isAnimationActive={!reduced}
          />
          <Bar dataKey="held" stackId="day" fill="var(--color-held)" isAnimationActive={!reduced} />
          <Bar
            dataKey="failed"
            stackId="day"
            fill="var(--color-failed)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={!reduced}
          >
            <LabelList dataKey="mark" {...VALUE_LABEL} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

const STAGE_CONFIG = {
  count: { label: 'ข้อผิดพลาด', theme: STATUS_STYLE.failed.chart },
} satisfies ChartConfig;

export function StageFailuresChart({
  failures,
  className,
}: {
  failures: StageFailures[];
  className?: string;
}) {
  const id = useChartId();
  const reduced = usePrefersReducedMotion();
  const series = stageSeries(failures);
  const height = Math.max(3, series.points.length) * 36 + 32;

  return (
    <ChartCard
      id={`${id}-stages`}
      title="ข้อผิดพลาดตามขั้นตอน"
      subtitle="ข้อผิดพลาดที่ต้องแก้ใน 30 วัน ไม่นับประกาศที่ไม่มี TOR"
      headline={{ value: formatCount(series.total), caption: 'รวม 30 วัน' }}
      empty={series.empty ? 'ไม่มีข้อผิดพลาดใน 30 วัน' : null}
      rows={series.points}
      rowKey={(row) => row.stage}
      columns={[
        { header: 'ขั้นตอน', cell: (row) => row.label },
        { header: 'จำนวน', cell: (row) => formatCount(row.count) },
      ]}
      className={className}
    >
      <ChartContainer
        config={STAGE_CONFIG}
        className="aspect-auto w-full tabular-nums"
        style={{ height }}
      >
        <BarChart
          data={series.points}
          layout="vertical"
          margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid horizontal={false} />
          <XAxis type="number" {...X_AXIS} allowDecimals={false} domain={[0, 'auto']} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={112} />
          {tooltip(STAGE_CONFIG, (value) => formatCount(value))}
          <Bar
            dataKey="count"
            fill="var(--color-count)"
            radius={[0, 3, 3, 0]}
            maxBarSize={20}
            isAnimationActive={!reduced}
          >
            <LabelList
              dataKey="count"
              position="right"
              offset={8}
              fontSize={12}
              className="fill-foreground"
              formatter={(value) => (typeof value === 'number' ? formatCount(value) : value)}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
