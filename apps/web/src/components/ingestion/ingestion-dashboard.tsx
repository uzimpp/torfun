'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { FailureLog } from './failure-log';
import { FilterBar } from './filter-bar';
import { ProjectTable } from './project-table';
import { SummaryCards } from './summary-cards';
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  useIngestionData,
  type FilterValues,
} from './use-ingestion-data';

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

  const { summary, projects, total, failures, loading, error, running, startRun } =
    useIngestionData(filters, page);

  // Any filter change invalidates the current page — page 4 of the old result
  // set is rarely page 4 of the new one, and is often past its end.
  const applyFilters = (patch: Partial<FilterValues>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="page-fill mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สถานะการดึงข้อมูลประกาศ TOR</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            ติดตามสถานะการประมวลผลของประกาศจัดซื้อจัดจ้างที่ดึงจากระบบ e-GP
            {summary?.lastRunAt
              ? ` · รอบล่าสุด ${new Date(summary.lastRunAt).toLocaleString('th-TH')}`
              : null}
          </p>
        </div>
        <Button onClick={() => void startRun()} disabled={running}>
          {running ? 'กำลังดึงข้อมูล…' : 'เริ่มรอบดึงข้อมูล'}
        </Button>
      </header>

      {error ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive text-base">เชื่อมต่อ API ไม่สำเร็จ</CardTitle>
            <CardDescription>{error}</CardDescription>
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

      <ProjectTable projects={projects} total={total} loading={loading} />

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
