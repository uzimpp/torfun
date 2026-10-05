'use client';

import { Activity, Gauge, PieChart } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { AdminPage, AdminSection } from '@/components/admin/admin-ui';
import { outcomeBuckets } from '@/lib/outcome-buckets';
import { ApprovalQueue } from './approval-queue';
import { AttentionRow, RunStateChip } from './attention-row';
import { DashboardTrends } from './dashboard-trends';
import { DashboardSkeleton } from './dashboard-skeleton';
import { KpiStrip } from './kpi-strip';
import { OutcomeDonut } from './outcome-donut';
import { RecentActivity } from './recent-activity';
import { SystemHealth } from './system-health';
import { useAdminDashboardData } from './use-admin-dashboard-data';
import { attentionChips, kpiTiles, runState } from './view-models';

const clock = (at: Date) =>
  at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });

/**
 * The Site Administrator's overview: what needs attention, the held records
 * waiting for a decision, and where the queue stands. Run control stays on the
 * ingestion page, one link away.
 */
export function AdminDashboard() {
  const { summary, recent, failures, asOf, loading, error, retry } = useAdminDashboardData();

  return (
    <AdminPage>
      <PageHeader
        title="ภาพรวม"
        description="สิ่งที่ต้องดูแล รายการรอตรวจสอบ และสถานะของประกาศที่ดึงเข้าระบบ"
        meta={asOf ? <span>อัปเดตเมื่อ {clock(asOf)}</span> : null}
        actions={summary && asOf ? <RunStateChip state={runState(summary, asOf)} /> : null}
      />

      {error ? <AdminLoadError error={error} onRetry={retry} /> : null}

      {loading ? <DashboardSkeleton /> : null}

      {summary && asOf ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="flex min-w-0 flex-col gap-10">
            <div className="flex flex-col gap-4">
              <AttentionRow chips={attentionChips(summary, failures, asOf)} />
              <KpiStrip tiles={kpiTiles(summary, asOf)} />
            </div>

            <ApprovalQueue
              lastRunAt={summary.lastRunAt}
              now={asOf}
              heldCount={summary.byOutcome.needs_review ?? 0}
              onChanged={retry}
            />

            <DashboardTrends live={summary.runInProgress} />

            <AdminSection id="recent-heading" title="อัปเดตล่าสุด" icon={Activity}>
              <RecentActivity items={recent} now={asOf} />
            </AdminSection>
          </div>

          <aside className="flex min-w-0 flex-col gap-10 border-t pt-10 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            <AdminSection id="outcome-heading" title="ผลการประมวลผล" icon={PieChart}>
              <OutcomeDonut
                buckets={outcomeBuckets(summary.byOutcome)}
                total={summary.total}
                byOutcome={summary.byOutcome}
              />
            </AdminSection>
            <AdminSection id="health-heading" title="สถานะระบบ" icon={Gauge}>
              <SystemHealth summary={summary} now={asOf} />
            </AdminSection>
          </aside>
        </div>
      ) : null}
    </AdminPage>
  );
}
