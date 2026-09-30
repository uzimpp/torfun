'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FailureLog } from './failure-log';
import { FilterBar } from './filter-bar';
import { ProjectTable } from './project-table';
import { runBanner } from './status-tracking';
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
 * Shown only while a run is in flight: which stage the work is in and how much
 * is left. A polite live region, so a screen reader hears the change without
 * being interrupted, and the dot pulses only for people who allow motion.
 */
function RunBanner({ title, detail }: { title: string; detail: string }) {
  return (
    <div
      role="status"
      aria-label={title}
      className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-xl border px-4 py-3"
    >
      <span
        className="bg-primary size-2.5 shrink-0 rounded-full motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <div className="flex flex-col">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{detail}</p>
      </div>
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
    retry,
  } = useIngestionData(filters, page);

  // Any filter change invalidates the current page — page 4 of the old result
  // set is rarely page 4 of the new one, and is often past its end.
  const applyFilters = (patch: Partial<FilterValues>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Moves while the console is open, so "in this stage for N minutes" keeps counting.
  const now = useNow(30_000);
  const banner = summary ? runBanner(summary) : null;

  return (
    <main className="page-fill mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">สถานะการดึงข้อมูลประกาศ TOR</h1>
          <p className="text-muted-foreground text-sm">
            ติดตามสถานะการประมวลผลของประกาศจัดซื้อจัดจ้างที่ดึงจากระบบ e-GP
          </p>
          {banner ? null : <RunStatus lastRunAt={summary?.lastRunAt ?? null} />}
        </div>
        <Button onClick={() => void startRun()} disabled={running}>
          {running ? 'กำลังดึงข้อมูล…' : 'เริ่มรอบดึงข้อมูล'}
        </Button>
      </header>

      {banner ? <RunBanner title={banner.title} detail={banner.detail} /> : null}

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
        years={(summary?.byYear ?? []).map((entry) => entry.year)}
      />

      <ProjectTable
        projects={projects}
        total={total}
        loading={loading}
        now={now}
        onClearFilters={() => applyFilters(EMPTY_FILTERS)}
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
    </main>
  );
}
