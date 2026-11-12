import Link from 'next/link';
import type { LiveRun } from '@torfun/types';
import { RECORD_LINK } from '@/components/admin/admin-ui';
import { procurementsHref } from '@/components/procurements/procurement-filter-values';
import { formatCount } from '@/lib/format-number';
import { liveWorkLabel } from './ops-view';
import { formatClock } from './status-tracking';

/**
 * What the Run has in hand right now, from its last heartbeat: Discovery while
 * it looks for announcements, and each project being fetched or read. Only
 * meaningful while a run is going; otherwise a single line says so.
 */
export function LiveWork({ live, now }: { live: LiveRun | null; now: Date }) {
  if (!live?.runInProgress) {
    return <p className="text-muted-foreground text-sm">ไม่มีรอบที่กำลังทำงาน</p>;
  }

  // Discovery first, then the work in pipeline order; the index is not shown.
  const work = [...(live.inFlight ?? [])].sort((a, b) => a.slot - b.slot);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs tabular-nums">
        {live.queueRemaining === null
          ? 'กำลังสร้างคิวของรอบนี้'
          : `เหลือในคิวรอบนี้ ${formatCount(live.queueRemaining)} รายการ`}
      </p>
      {live.inFlight === null ? (
        <p className="text-muted-foreground text-sm">ยังไม่ได้รับสัญญาณแรกจากรอบนี้</p>
      ) : work.length === 0 ? (
        <p className="text-muted-foreground text-sm">ไม่มีรายการที่กำลังทำในขณะนี้</p>
      ) : (
        <ul aria-label="รายการที่กำลังทำ" className="flex flex-col divide-y border-y">
          {work.map((item) => (
            <li
              key={`${item.slot}-${item.projectId}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-2.5"
            >
              {item.stage === 'discovery' ? (
                <span className="text-sm">{liveWorkLabel(item)}</span>
              ) : (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={procurementsHref({ id: item.projectId })} className={RECORD_LINK}>
                    {item.projectName}
                  </Link>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-mono">{item.projectId}</span>
                    <span>{liveWorkLabel(item)}</span>
                    {item.fresh ? null : (
                      <span className="rounded-sm border px-1.5 py-px">อัปเดตไทม์ไลน์เท่านั้น</span>
                    )}
                  </span>
                </div>
              )}
              <span className="text-sm tabular-nums">
                <span className="sr-only">อยู่ในขั้นนี้ </span>
                {formatClock(now.getTime() - Date.parse(item.since))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
