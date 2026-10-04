'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RunBanner as RunBannerView } from './status-tracking';

/**
 * Shown only while a run is in flight. A polite live region, except the elapsed
 * clock, which ticks every second and would never stop talking.
 *
 * Stopping asks first, because it is not undone: the run ends once the records
 * in hand are finished, and the rest wait for the next one.
 */
export function RunBanner({
  banner,
  onStop,
}: {
  banner: RunBannerView;
  onStop: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const pending = sending || banner.stopping;

  const confirm = async () => {
    setConfirming(false);
    setSending(true);
    try {
      await onStop();
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      aria-label={banner.title}
      className="bg-card border-primary flex flex-wrap items-center gap-x-6 gap-y-3 rounded-r-lg border-y border-r border-l-[3px] py-3 pr-3 pl-4"
    >
      <span
        className="bg-primary size-2 shrink-0 rounded-full motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-medium">{banner.title}</p>
        <p className="text-muted-foreground font-mono text-xs tabular-nums">{banner.detail}</p>
      </div>
      {banner.elapsed ? (
        <p aria-live="off" className="flex flex-col items-end">
          <span className="text-muted-foreground text-xs">เวลาที่รัน</span>
          <span className="font-mono text-lg font-semibold tabular-nums">{banner.elapsed}</span>
        </p>
      ) : null}

      <Button
        variant="outline"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setConfirming(true)}
        className="min-h-11 active:translate-y-px"
      >
        {pending ? 'กำลังหยุด' : 'หยุดรอบนี้'}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>หยุดรอบนี้?</DialogTitle>
            <DialogDescription>
              รายการที่กำลังทำอยู่จะทำต่อจนเสร็จ ที่เหลือจะยังอยู่ในคิว
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              ไม่หยุด
            </Button>
            <Button variant="destructive" onClick={() => void confirm()}>
              หยุดรอบนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
