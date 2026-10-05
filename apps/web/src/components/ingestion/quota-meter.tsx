import type { OpenDataQuota } from '@torfun/types';
import { describeQuota, quotaFigure, todaysQuota } from '@/lib/open-data-quota';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { cn } from '@/lib/utils';

/**
 * Today's open-data allowance. Discovery is gated on it, so an administrator
 * wondering why a run found nothing new can see it here.
 */
export function QuotaMeter({ quota, now }: { quota: OpenDataQuota | null; now: Date }) {
  const current = todaysQuota(quota, now);
  const { label, low } = describeQuota(quota, now);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted-foreground text-sm">โควตา open-data วันนี้</span>
        <span className="text-sm tabular-nums">
          {current ? quotaFigure(current) : 'ยังไม่ทราบ'}
        </span>
      </div>
      {current ? <QuotaBar quota={current} low={low} /> : null}
      {low ? <p className={cn('text-xs', STATUS_STYLE.needsReview.text)}>{label}</p> : null}
    </div>
  );
}

/** The thin bar under a quota figure; only for a current reading that has a limit. */
export function QuotaBar({ quota, low }: { quota: OpenDataQuota; low: boolean }) {
  if (!quota.limitDay) return null;
  return (
    <div
      role="meter"
      aria-label="โควตา open-data วันนี้"
      aria-valuemin={0}
      aria-valuemax={quota.limitDay}
      aria-valuenow={quota.remainingDay}
      className="bg-muted h-1 w-full overflow-hidden rounded-full"
    >
      <div
        className={cn('h-full rounded-full', low ? STATUS_STYLE.needsReview.dot : 'bg-primary')}
        style={{ width: `${Math.min(100, (quota.remainingDay / quota.limitDay) * 100)}%` }}
      />
    </div>
  );
}
