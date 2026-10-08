import Link from 'next/link';
import { OUTCOME_LABELS, type Procurement } from '@torfun/types';
import { cn } from '@/lib/utils';
import { BUCKET_STYLE } from './bucket-style';
import { bucketOfOutcome } from './outcome-buckets';
import { timeAgoTh } from './view-models';

/**
 * The procurements a run touched most recently, newest first.
 *
 * An analysed TOR links to its detail page, where the summary and the way back
 * to the source live. Anything else has nothing to read yet, so it goes to the
 * ingestion console, where its history and failure reason are.
 */
export function RecentActivity({ items, now }: { items: Procurement[]; now: Date }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium">ยังไม่มีความเคลื่อนไหว</p>
        <p className="text-muted-foreground max-w-xs text-xs">
          รายการที่ถูกดึงหรืออัปเดตล่าสุดจะแสดงที่นี่หลังรอบดึงข้อมูลครั้งแรก
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const style = BUCKET_STYLE[bucketOfOutcome(item.outcome)];
        const Icon = style.icon;
        const href =
          item.outcome === 'tor_analysed' ? `/tor/${item.projectId}` : '/admin/ingestion';
        return (
          <li
            key={item.projectId}
            className="flex flex-col gap-1.5 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <Link
              href={href}
              className="focus-visible:ring-ring/50 line-clamp-2 min-h-6 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
            >
              {item.projectName}
            </Link>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', style.swatch)} aria-hidden="true" />
                <Icon className={cn('size-3.5', style.iconClass)} aria-hidden="true" />
                <span className="text-foreground">{OUTCOME_LABELS[item.outcome]}</span>
              </span>
              <span className="min-w-0 truncate">{item.deptName}</span>
              <time
                dateTime={item.updatedAt}
                title={new Date(item.updatedAt).toLocaleString('th-TH')}
              >
                {timeAgoTh(item.updatedAt, now)}
              </time>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
