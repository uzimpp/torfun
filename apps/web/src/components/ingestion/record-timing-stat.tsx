import { Timer } from 'lucide-react';
import type { RecordTimings } from '@torfun/types';
import { StatValue } from '@/components/admin/admin-ui';
import { recordTimingView } from './trend-series';

/** One compact figure: how long a record takes from download to analysis. */
export function RecordTimingStat({ timings }: { timings: RecordTimings }) {
  const view = recordTimingView(timings);

  return (
    <div
      role="group"
      aria-labelledby="record-timing-title"
      className="bg-card flex flex-col gap-3 rounded-xl border p-5"
    >
      <span id="record-timing-title" className="flex items-center gap-2 text-base font-medium">
        <Timer className="text-muted-foreground size-4" aria-hidden="true" />
        เวลาต่อรายการ (มัธยฐาน 30 วัน)
      </span>
      {view.empty ? (
        <p className="text-muted-foreground text-sm">{view.empty}</p>
      ) : (
        <div className="flex flex-col gap-1 tabular-nums">
          <StatValue>{view.median}</StatValue>
          <span className="text-muted-foreground text-xs">{view.split}</span>
          <span className="text-muted-foreground text-xs">{view.sample}</span>
        </div>
      )}
    </div>
  );
}
