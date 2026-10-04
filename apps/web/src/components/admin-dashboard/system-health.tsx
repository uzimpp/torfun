import Link from 'next/link';
import type { IngestionSummaryResponse } from '@/lib/api';
import { formatThaiDate } from '@/lib/format-date';
import { formatCount } from '@/lib/format-number';
import { QuotaBar } from '@/components/ingestion/quota-meter';
import { quotaFigure, quotaIsLow, todaysQuota } from '@/lib/open-data-quota';
import { timeAgoTh } from './view-models';

/** A short read on the machinery: the last run, today's open-data allowance, the failure log. */
export function SystemHealth({ summary, now }: { summary: IngestionSummaryResponse; now: Date }) {
  const quota = todaysQuota(summary.openDataQuota, now);
  const low = quotaIsLow(quota, now);

  return (
    <dl className="flex flex-col divide-y text-sm">
      <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
        <dt className="text-muted-foreground">รอบล่าสุด</dt>
        <dd className="text-right font-mono text-xs tabular-nums">
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

      <div className="flex flex-col gap-2 py-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">โควตา open-data</dt>
          <dd className="font-mono text-xs tabular-nums">
            {quota ? quotaFigure(quota) : 'ยังไม่ทราบ'}
          </dd>
        </div>
        {quota?.limitDay ? (
          <dd>
            <QuotaBar quota={quota} low={low} />
          </dd>
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-4 py-2.5 last:pb-0">
        <dt className="text-muted-foreground">บันทึกข้อผิดพลาด</dt>
        <dd>
          <Link
            href="/admin/ingestion#failures"
            className="rounded-sm font-mono text-xs tabular-nums underline-offset-4 hover:underline"
          >
            {formatCount(summary.failureCount)} รายการ
          </Link>
        </dd>
      </div>
    </dl>
  );
}
