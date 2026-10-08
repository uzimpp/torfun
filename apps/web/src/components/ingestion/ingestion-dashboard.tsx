'use client';

import { Activity } from 'lucide-react';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { AdminPage, AdminSection } from '@/components/admin/admin-ui';
import { LoadingRegion } from '@/components/admin/loading-region';
import { KpiStrip } from '@/components/admin-dashboard/kpi-strip';
import { recordTiles } from '@/components/admin-dashboard/view-models';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { formatThaiDate } from '@/lib/format-date';
import { FailureLog } from './failure-log';
import { LiveWork } from './live-work';
import { OpsCharts } from './ops-charts';
import { RunHistory } from './run-history';
import { RunStatusBar } from './run-status-bar';
import { useIngestionOps } from './use-ingestion-ops';
import { useIngestionRun } from './use-ingestion-run';
import { useNow } from './use-now';

const clock = (at: Date) =>
  at.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  });

const TILE_GRID =
  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 sm:[&>li:last-child]:col-span-2 lg:[&>li:last-child]:col-span-1';

function MonitoringSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4">
      <Skeleton className="h-48 w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </LoadingRegion>
  );
}

/**
 * Operations and monitoring for e-GP ingestion: run control, what the runners
 * are doing now, where every record stands, how runs have gone, and the failure
 * log. Browsing the records themselves lives on /admin/procurements.
 */
export function IngestionDashboard() {
  const run = useIngestionRun();
  const { summary, failures, error, actionError, running, starting, startRun, stopRun, reload } =
    run;
  const opsData = useIngestionOps({ live: running });
  const { ops } = opsData;

  // Every second while a run is going, so its clock counts in seconds.
  const now = useNow(running ? 1000 : 30_000);
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
            {updatedAt ? <span>อัปเดตเมื่อ {clock(updatedAt)}</span> : null}
          </>
        }
      />

      <div className="flex min-w-0 flex-col gap-10">
        <div className="flex min-w-0 flex-col gap-4">
          {summary ? (
            <RunStatusBar
              summary={summary}
              now={now}
              starting={starting}
              onStart={() => void startRun()}
              onStop={stopRun}
            />
          ) : (
            <LoadingRegion>
              <Skeleton className="h-16 w-full rounded-xl" />
            </LoadingRegion>
          )}

          {error ? <AdminLoadError error={error} onRetry={reload} /> : null}
          {actionError ? (
            <AdminLoadError
              error={actionError.error}
              title={
                actionError.action === 'stop' ? 'หยุดรอบไม่สำเร็จ' : 'เริ่มรอบดึงข้อมูลไม่สำเร็จ'
              }
            />
          ) : null}

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
        </div>

        {summary ? (
          <KpiStrip tiles={recordTiles(summary)} label="สถานะรายการทั้งหมด" className={TILE_GRID} />
        ) : (
          <LoadingRegion>
            <Skeleton className="h-28 w-full rounded-xl" />
          </LoadingRegion>
        )}

        {opsData.error ? <AdminLoadError error={opsData.error} onRetry={opsData.reload} /> : null}

        {ops ? (
          <>
            <RunHistory runs={ops.runs} />
            <OpsCharts ops={ops} />
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
    </AdminPage>
  );
}
