'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { IngestionSummaryResponse } from '@/lib/api';
import { describeQuota, quotaFigure, todaysQuota } from '@/lib/open-data-quota';
import { cn } from '@/lib/utils';
import { RunToggle } from './run-toggle';
import { ScheduleSettings } from './schedule-card';
import { runStatus } from './status-tracking';

/**
 * The run's one control surface: start or stop, what it is doing, how long it
 * has been going, today's open-data allowance, and the schedule behind a gear.
 */
export function RunStatusBar({
  summary,
  now,
  starting,
  onStart,
  onStop,
}: {
  summary: IngestionSummaryResponse;
  now: Date;
  starting: boolean;
  onStart: () => void;
  onStop: () => Promise<void>;
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const status = runStatus(summary, now);
  const quota = todaysQuota(summary.openDataQuota, now);
  const { label: quotaLabel, low } = describeQuota(summary.openDataQuota, now);

  return (
    <section
      aria-label="สถานะรอบดึงข้อมูล"
      className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 sm:px-4"
    >
      <RunToggle phase={status.phase} starting={starting} onStart={onStart} onStop={onStop} />

      <p role="status" className="flex min-w-0 items-center gap-2 text-base font-medium">
        {status.phase === 'idle' ? null : (
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              STATUS_STYLE.running.dot,
              'motion-safe:animate-pulse',
            )}
          />
        )}
        {status.label}
      </p>

      <div className="ml-auto flex items-center gap-x-4 gap-y-1">
        {status.elapsed ? (
          <span aria-live="off" className="text-lg tabular-nums">
            <span className="sr-only">เวลาที่รัน </span>
            {status.elapsed}
          </span>
        ) : null}
        <span
          title={quotaLabel}
          className={cn(
            'text-xs tabular-nums',
            low ? STATUS_STYLE.needsReview.text : 'text-muted-foreground',
          )}
        >
          โควตา {quota ? quotaFigure(quota) : 'ยังไม่ทราบ'}
        </span>
        <Button
          variant="ghost"
          size="icon-lg"
          className="rounded-full"
          aria-label="ตั้งค่าตารางเวลา"
          onClick={() => setScheduleOpen(true)}
        >
          <Settings className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium">ตารางเวลาดึงข้อมูลอัตโนมัติ</DialogTitle>
            <DialogDescription>
              ตั้งให้เริ่มรอบดึงข้อมูลเองตามเวลา โดยไม่ต้องกดปุ่มเริ่มรอบ
            </DialogDescription>
          </DialogHeader>
          <ScheduleSettings />
        </DialogContent>
      </Dialog>
    </section>
  );
}
