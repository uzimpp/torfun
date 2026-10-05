import { StatValue } from '@/components/admin/admin-ui';
import type { RunBanner as RunBannerView } from './status-tracking';

/**
 * Shown only while a run is in flight. A polite live region, except the elapsed
 * clock, which ticks every second and would never stop talking. The stop control
 * sits with the other run actions in the page header.
 */
export function RunBanner({ banner }: { banner: RunBannerView }) {
  return (
    <div
      role="status"
      aria-label={banner.title}
      className="bg-card border-primary flex flex-wrap items-center gap-x-6 gap-y-3 rounded-r-lg border-y border-r border-l-[3px] py-3 pr-4 pl-4"
    >
      <span
        className="bg-primary size-2 shrink-0 rounded-full motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">{banner.title}</p>
        <p className="text-muted-foreground text-xs tabular-nums">{banner.detail}</p>
      </div>
      {banner.elapsed ? (
        <p aria-live="off" className="flex flex-col items-end">
          <span className="text-muted-foreground text-xs">เวลาที่รัน</span>
          <StatValue>{banner.elapsed}</StatValue>
        </p>
      ) : null}
    </div>
  );
}
