import type { IngestionOps } from '@torfun/types';
import { formatCount } from '@/lib/format-number';
import { formatBytes, formatDuration } from './ops-view';

interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string;
}

const TRIGGER_LABELS = { manual: 'สั่งเอง', scheduled: 'ตามตารางเวลา' } as const;

function tiles(ops: IngestionOps): Tile[] {
  const last = ops.runs[0] ?? null;
  const { recordTimings: timings, live } = ops;

  return [
    {
      key: 'duration',
      label: 'ระยะเวลารอบล่าสุด',
      value: formatDuration(last?.durationMs ?? null),
      hint: last
        ? `${TRIGGER_LABELS[last.trigger]} · ${last.runners} ตัวทำงาน`
        : 'ยังไม่มีบันทึกรอบ',
    },
    {
      key: 'perRecord',
      label: 'เวลาต่อรายการ (มัธยฐาน 30 วัน)',
      value: formatDuration(timings.p50Ms),
      hint:
        timings.sample > 0
          ? `p90 ${formatDuration(timings.p90Ms)} · ดาวน์โหลด ${formatDuration(timings.downloadP50Ms)} · วิเคราะห์ ${formatDuration(timings.analyseP50Ms)} · n=${formatCount(timings.sample)}`
          : 'ยังไม่มีรายการที่วัดได้ใน 30 วัน',
    },
    live.memory
      ? {
          key: 'memory',
          label: 'หน่วยความจำ (ขณะนี้)',
          value: formatBytes(live.memory.rssBytes),
          hint: `สูงสุดรอบนี้ ${formatBytes(live.memory.peakRssBytes)} · heap ${formatBytes(live.memory.heapUsedBytes)}`,
        }
      : {
          key: 'memory',
          label: 'หน่วยความจำสูงสุด (รอบล่าสุด)',
          value: last ? formatBytes(last.peakRssBytes) : '—',
          hint: live.runInProgress ? 'รอสัญญาณแรกจากรอบนี้' : 'บันทึกเมื่อรอบจบ',
        },
    {
      key: 'tokens',
      label: 'โทเคน รอบล่าสุด',
      value: last ? formatCount(last.tokens.total) : '—',
      hint: last
        ? `prompt ${formatCount(last.tokens.prompt)} · output ${formatCount(last.tokens.output)} · thinking ${formatCount(last.tokens.thoughts)} · ${formatCount(last.tokens.calls)} ครั้ง`
        : 'ยังไม่มีบันทึกรอบ',
    },
  ];
}

/** The four numbers that say how the machinery is doing, as one ruled strip. */
export function OpsTiles({ ops }: { ops: IngestionOps }) {
  return (
    <ul
      aria-label="ตัวชี้วัดการทำงาน"
      className="bg-border grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2 xl:grid-cols-4"
    >
      {tiles(ops).map((tile) => (
        <li
          key={tile.key}
          role="group"
          aria-label={tile.label}
          className="bg-card flex flex-col gap-1 p-4"
        >
          <span className="text-muted-foreground text-xs">{tile.label}</span>
          <span className="font-mono text-xl font-semibold tabular-nums">{tile.value}</span>
          <span className="text-muted-foreground font-mono text-[11px] leading-relaxed tabular-nums">
            {tile.hint}
          </span>
        </li>
      ))}
    </ul>
  );
}
