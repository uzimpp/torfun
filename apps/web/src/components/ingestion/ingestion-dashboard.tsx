'use client';

import { Activity, BarChart3, Play } from 'lucide-react';
import type { OpenDataQuota } from '@torfun/types';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { AdminPage, AdminSection } from '@/components/admin/admin-ui';
import { LoadingRegion } from '@/components/admin/loading-region';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatThaiDate } from '@/lib/format-date';
import { quotaFigure, todaysQuota } from '@/lib/open-data-quota';
import { FailureLog } from './failure-log';
import { LiveWork } from './live-work';
import { OpsCharts } from './ops-charts';
import { QuotaMeter } from './quota-meter';
import { RunBanner } from './run-banner';
import { RunHistory } from './run-history';
import { ScheduleCard } from './schedule-card';
import { runBanner } from './status-tracking';
import { StopRunButton } from './stop-run-button';
import { useIngestionOps } from './use-ingestion-ops';
import { useIngestionRun } from './use-ingestion-run';
import { useNow } from './use-now';

function quotaFigureToday(quota: OpenDataQuota | null, now: Date): string {
  const current = todaysQuota(quota, now);
  return current ? quotaFigure(current) : 'ยังไม่ทราบ';
}

const clock = (at: Date) =>
  at.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  });

function MonitoringSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </LoadingRegion>
  );
}

/**
 * Operations and monitoring for e-GP ingestion: run control, what the runners
 * are doing now, how runs have gone, and the failure log. Browsing the records
 * themselves lives on /admin/procurements.
 */
export function IngestionDashboard() {
  const run = useIngestionRun();
  const { summary, failures, error, actionError, running, starting, startRun, stopRun, reload } =
    run;
  const opsData = useIngestionOps({ live: running });
  const { ops } = opsData;

  // Every second while a run is going, so its clock counts in seconds.
  const now = useNow(running ? 1000 : 30_000);
  const banner = summary ? runBanner(summary, now) : null;
  const updatedAt = opsData.updatedAt ?? run.updatedAt;

  return (
    <AdminPage>
      <PageHeader
        crumbs={[{ label: 'ผู้ดูแลระบบ', href: '/dashboard' }, { label: 'ระบบดึงข้อมูล' }]}
        title="ระบบดึงข้อมูล"
        description="ควบคุมรอบดึงข้อมูลจากระบบ e-GP ติดตามงานที่กำลังทำ และดูประวัติการทำงาน"
        meta={
          <>
            <span>
              {summary?.lastRunAt
                ? `รอบล่าสุด ${formatThaiDate(summary.lastRunAt, { withTime: true })}`
                : 'ยังไม่เคยเริ่มรอบดึงข้อมูล'}
            </span>
            {summary ? <span>โควตา {quotaFigureToday(summary.openDataQuota, now)}</span> : null}
            {updatedAt ? <span>อัปเดตเมื่อ {clock(updatedAt)}</span> : null}
          </>
        }
        actions={
          <>
            {running && banner ? (
              <StopRunButton stopping={banner.stopping} onStop={stopRun} />
            ) : null}
            <Button
              onClick={() => void startRun()}
              disabled={running || starting}
              aria-busy={starting || undefined}
            >
              <Play data-icon="inline-start" className="size-4" aria-hidden="true" />
              เริ่มรอบดึงข้อมูล
            </Button>
          </>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <div className="flex min-w-0 flex-col gap-10">
          {banner ? <RunBanner banner={banner} /> : null}

          {error ? <AdminLoadError error={error} onRetry={reload} /> : null}
          {actionError ? (
            <AdminLoadError
              error={actionError.error}
              title={
                actionError.action === 'stop' ? 'หยุดรอบไม่สำเร็จ' : 'เริ่มรอบดึงข้อมูลไม่สำเร็จ'
              }
            />
          ) : null}
          {opsData.error ? <AdminLoadError error={opsData.error} onRetry={opsData.reload} /> : null}

          {running ? (
            <AdminSection id="live-heading" title="งานที่กำลังทำ" icon={Activity}>
              {ops || !opsData.loading ? (
                <LiveWork live={ops?.live ?? null} now={now} />
              ) : (
                <LoadingRegion>
                  <Skeleton className="h-12 w-full" />
                </LoadingRegion>
              )}
            </AdminSection>
          ) : null}

          {ops ? (
            <>
              <AdminSection id="trends-heading" title="แนวโน้ม" icon={BarChart3}>
                <OpsCharts ops={ops} />
              </AdminSection>
              <RunHistory runs={ops.runs} />
            </>
          ) : opsData.loading ? (
            <MonitoringSkeleton />
          ) : null}

          <FailureLog
            failures={failures}
            runs={ops?.runs ?? []}
            liveStartedAt={running ? (summary?.runStartedAt ?? null) : null}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-10 border-t pt-10 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
          {summary ? (
            <QuotaMeter quota={summary.openDataQuota} now={now} />
          ) : (
            <LoadingRegion>
              <Skeleton className="h-8 w-full" />
            </LoadingRegion>
          )}
          <ScheduleCard />
        </aside>
      </div>
    </AdminPage>
  );
}
