import type { OpenDataQuota } from '@torfun/types';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { cn } from '@/lib/utils';

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
