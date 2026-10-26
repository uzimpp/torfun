import Link from 'next/link';
import { ADMIN_LINK } from '@/components/admin/admin-ui';
import type { IngestionSummaryResponse } from '@/lib/api';
import { formatThaiDate } from '@/lib/format-date';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';
import { timeAgoTh } from './view-models';

export function SystemHealth({ summary, now }: { summary: IngestionSummaryResponse; now: Date }) {
  return (
    <dl className="flex flex-col divide-y text-sm">
      <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
        <dt className="text-muted-foreground">รอบล่าสุด</dt>
        <dd className="text-right tabular-nums">
          {summary.runInProgress ? (
            <span className="text-primary">กำลังดึงข้อมูล</span>
          ) : summary.lastRunAt ? (
            <time
              dateTime={summary.lastRunAt}
              title={formatThaiDate(summary.lastRunAt, { withTime: true })}
            >
              {timeAgoTh(summary.lastRunAt, now)}
            </time>
          ) : (
            'ยังไม่เคยดึงข้อมูล'
          )}
        </dd>
      </div>

      <div className="flex items-baseline justify-between gap-4 py-2.5 last:pb-0">
        <dt className="text-muted-foreground">บันทึกข้อผิดพลาด</dt>
        <dd>
          <Link href="/admin/ingestion#failures" className={cn(ADMIN_LINK, 'tabular-nums')}>
            {formatCount(summary.failureCount)} รายการ
          </Link>
        </dd>
      </div>
    </dl>
  );
}
