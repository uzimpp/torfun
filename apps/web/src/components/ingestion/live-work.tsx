import Link from 'next/link';
import type { LiveRun } from '@torfun/types';
import { procurementsHref } from '@/components/procurements/procurement-filter-values';
import { formatCount } from '@/lib/format-number';
import { STAGE_LABELS } from './ops-view';
import { formatClock } from './status-tracking';

/**
 * What each runner has in hand right now, from the run's last heartbeat. Only
 * meaningful while a run is going; otherwise a single line says so.
 */
export function LiveWork({ live, now }: { live: LiveRun | null; now: Date }) {
  if (!live?.runInProgress) {
    return <p className="text-muted-foreground text-sm">ไม่มีรอบที่กำลังทำงาน</p>;
  }

  const slots = [...(live.inFlight ?? [])].sort((a, b) => a.slot - b.slot);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground font-mono text-xs tabular-nums">
        {live.queueRemaining === null
          ? 'กำลังสร้างคิวของรอบนี้'
          : `เหลือในคิวรอบนี้ ${formatCount(live.queueRemaining)} รายการ`}
      </p>
      {live.inFlight === null ? (
        <p className="text-muted-foreground text-sm">ยังไม่ได้รับสัญญาณแรกจากรอบนี้</p>
      ) : slots.length === 0 ? (
        <p className="text-muted-foreground text-sm">ไม่มีรายการที่กำลังทำในขณะนี้</p>
      ) : (
        <ul aria-label="รายการที่กำลังทำ" className="flex flex-col divide-y border-y">
          {slots.map((work) => (
            <li
              key={`${work.slot}-${work.projectId}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-2.5"
            >
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                #{work.slot + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={procurementsHref({ id: work.projectId })}
                  className="line-clamp-2 text-sm underline-offset-4 hover:underline"
                >
                  {work.projectName}
                </Link>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-mono tabular-nums">{work.projectId}</span>
                  <span>{STAGE_LABELS[work.stage]}</span>
                  {work.fresh ? null : (
                    <span className="rounded-sm border px-1.5 py-px">อัปเดตไทม์ไลน์เท่านั้น</span>
                  )}
                </span>
              </div>
              <span className="font-mono text-sm tabular-nums">
                <span className="sr-only">อยู่ในขั้นนี้ </span>
                {formatClock(now.getTime() - Date.parse(work.since))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
