'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { DroppedCard } from './dropped-card';
import { FailureLog } from './failure-log';
import { FilterBar } from './filter-bar';
import { HeldCard } from './held-card';
import { ProjectTable } from './project-table';
import { ScheduleCard } from './schedule-card';
import { describeQuota, runBanner, type RunBanner as RunBannerView } from './status-tracking';
import { SummaryCards } from './summary-cards';
import { useNow } from './use-now';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  useIngestionData,
  type FilterValues,
} from './use-ingestion-data';

/**
 * A quiet line under the heading: when the last run finished. While a run is in
 * flight the banner below says so, in more detail, so this stays out of its way.
 */
function RunStatus({ lastRunAt }: { lastRunAt: string | null }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
      <span className="bg-muted-foreground/40 size-2 rounded-full" aria-hidden="true" />
      {lastRunAt
        ? `รอบล่าสุด ${new Date(lastRunAt).toLocaleString('th-TH')}`
        : 'ยังไม่เคยเริ่มรอบดึงข้อมูล'}
    </span>
  );
}

/**
 * How much of the open-data API's daily allowance is left. Discovery is gated on
 * it, so an administrator wondering why a Run found nothing new can see it here.
 * The wording carries the warning as well as the colour.
 */
function QuotaNote({
  quota,
  nowMs,
}: {
  quota: Parameters<typeof describeQuota>[0];
  nowMs: number;
}) {
  const { label, low } = describeQuota(quota, nowMs);
  return (
    <span
      className={cn('text-sm', low ? 'text-destructive font-medium' : 'text-muted-foreground')}
      data-low={low || undefined}
    >
      {label}
    </span>
  );
}

/**
 * Shown only while a run is in flight: which stage the work is in, how much is
 * left, how long it has been going, and the way to stop it. A polite live
 * region, so a screen reader hears the change without being interrupted — except
 * the elapsed time, which ticks every second and would never stop talking. The
 * dot pulses only for people who allow motion.
 *
 * Stopping asks first, because it is not undone: the run ends once the records
 * in hand are finished, and the rest wait for the next one.
 */
function RunBanner({ banner, onStop }: { banner: RunBannerView; onStop: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      role="status"
      aria-label={banner.title}
      className="border-primary/30 bg-primary/5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
    >
      <span
        className="bg-primary size-2.5 shrink-0 rounded-full motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-medium">{banner.title}</p>
        <p className="text-muted-foreground text-xs">{banner.detail}</p>
        {banner.elapsed ? (
          <p aria-live="off" className="text-muted-foreground text-xs tabular-nums">
            {banner.elapsed}
          </p>
        ) : null}
      </div>

      <Button
        variant="outline"
        disabled={banner.stopping}
        aria-busy={banner.stopping || undefined}
        onClick={() => setConfirming(true)}
        className="min-h-11"
      >
        {banner.stopping ? 'กำลังหยุด…' : 'หยุดรอบนี้'}
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
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onStop();
              }}
            >
              หยุดรอบนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Site Administrator view of the e-GP ingestion queue.
 *
 * Client-rendered because it is an interactive console — filters, polling and a
 * run trigger — rather than a document. Everything it shows comes from the API;
 * no data is duplicated here. This component owns only filter and pagination
 * state; fetching lives in `useIngestionData`.
 */
export function IngestionDashboard() {
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  /** Bumped when an administrator action moves a record between the table and the cards. */
  const [changes, setChanges] = useState(0);

  const {
    summary,
    projects,
    total,
    failures,
    loading,
    error,
    sessionEnded,
    running,
    startRun,
    stopRun,
    retry,
  } = useIngestionData(filters, page);

  // Any filter change invalidates the current page — page 4 of the old result
  // set is rarely page 4 of the new one, and is often past its end.
  const applyFilters = (patch: Partial<FilterValues>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  };

  const onChanged = () => {
    retry();
    setChanges((count) => count + 1);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Moves while the console is open, so "in this stage for N minutes" keeps counting.
  // Every second while a run is going, so its elapsed time counts in seconds; the
  // slow tick otherwise, so nothing ticks fast when no run is in progress.
  const now = useNow(running ? 1000 : 30_000);
  const banner = summary ? runBanner(summary, now) : null;

  return (
    <main className="page-fill mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">สถานะการดึงข้อมูลประกาศ TOR</h1>
          <p className="text-muted-foreground text-sm">
            ติดตามสถานะการประมวลผลของประกาศจัดซื้อจัดจ้างที่ดึงจากระบบ e-GP
          </p>
          {banner ? null : <RunStatus lastRunAt={summary?.lastRunAt ?? null} />}
          {summary ? <QuotaNote quota={summary.openDataQuota} nowMs={now.getTime()} /> : null}
        </div>
        <Button onClick={() => void startRun()} disabled={running}>
          {running ? 'กำลังดึงข้อมูล…' : 'เริ่มรอบดึงข้อมูล'}
        </Button>
      </header>

      {banner ? <RunBanner banner={banner} onStop={() => void stopRun()} /> : null}

      {error ? (
        <Card className="border-destructive/50" role="alert">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {sessionEnded ? 'เซสชันหมดอายุ' : 'เชื่อมต่อ API ไม่สำเร็จ'}
            </CardTitle>
            <CardDescription>{error}</CardDescription>
            <div className="pt-2">
              {sessionEnded ? (
                <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }))}>
                  เข้าสู่ระบบอีกครั้ง
                </Link>
              ) : (
                <Button variant="outline" onClick={retry}>
                  ลองอีกครั้ง
                </Button>
              )}
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {summary ? <SummaryCards summary={summary} /> : null}

      <FilterBar
        values={filters}
        onChange={applyFilters}
        agencies={summary?.agencies ?? []}
        budgetYears={(summary?.byYear ?? []).map((entry) => entry.budgetYear)}
      />

      <ProjectTable
        projects={projects}
        total={total}
        loading={loading}
        now={now}
        onClearFilters={() => applyFilters(EMPTY_FILTERS)}
        onChanged={onChanged}
      />

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          หน้า {page + 1} จาก {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            ก่อนหน้า
          </Button>
          <Button
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            ถัดไป
          </Button>
        </div>
      </div>

      <Separator />

      <FailureLog failures={failures} />

      <HeldCard reloadKey={changes} onChanged={onChanged} />

      <DroppedCard reloadKey={changes} onChanged={onChanged} />

      <ScheduleCard />
    </main>
  );
}
