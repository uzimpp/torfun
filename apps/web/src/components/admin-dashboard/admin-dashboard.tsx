'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DashboardSkeleton } from './dashboard-skeleton';
import { KpiStrip } from './kpi-strip';
import { OutcomeDonut } from './outcome-donut';
import { outcomeBuckets } from './outcome-buckets';
import { RecentActivity } from './recent-activity';
import { useAdminDashboardData } from './use-admin-dashboard-data';
import { kpiTiles } from './view-models';

/**
 * The Site Administrator's overview: how much is in the queue, where it stands,
 * and what a run touched last.
 *
 * Read-only by design. Starting a run and reading a record's history stay on the
 * ingestion console, one link away, so this page never grows a second set of
 * controls to keep in step with that one. Fetching lives in
 * `useAdminDashboardData`; this component only decides what to draw.
 */
export function AdminDashboard() {
  const { summary, recent, asOf, loading, error, sessionEnded, retry } = useAdminDashboardData();

  return (
    <main className="page-fill mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-primary text-sm font-medium">พื้นที่ทำงาน / แดชบอร์ดผู้ดูแลระบบ</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            ภาพรวมการดึงข้อมูล TOR
          </h1>
          <p className="text-muted-foreground max-w-prose text-sm">
            สถานะของประกาศที่ดึงเข้าระบบ และรายการที่ถูกอัปเดตล่าสุด
          </p>
        </div>
        <Link
          href="/admin/ingestion"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 px-4')}
        >
          ติดตามการดึงข้อมูล <ArrowUpRight aria-hidden="true" />
        </Link>
      </header>

      {error ? (
        <Card className="border-destructive/50" role="alert">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              {sessionEnded ? 'เซสชันหมดอายุ' : 'โหลดข้อมูลไม่สำเร็จ'}
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

      {loading ? <DashboardSkeleton /> : null}

      {summary && asOf ? (
        <>
          <KpiStrip tiles={kpiTiles(summary, asOf)} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section aria-labelledby="outcome-heading" className="bg-card rounded-xl border p-6">
              <h2 id="outcome-heading" className="mb-5 text-base font-semibold">
                ผลการประมวลผล
              </h2>
              <OutcomeDonut
                buckets={outcomeBuckets(summary.byOutcome)}
                total={summary.total}
                byOutcome={summary.byOutcome}
              />
            </section>

            <section aria-labelledby="recent-heading" className="bg-card rounded-xl border p-6">
              <h2 id="recent-heading" className="mb-5 text-base font-semibold">
                อัปเดตล่าสุด
              </h2>
              <RecentActivity items={recent} now={asOf} />
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
