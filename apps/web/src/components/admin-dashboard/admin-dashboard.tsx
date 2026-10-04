'use client';

import { PageHeader } from '@/components/layout/page-header';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { outcomeBuckets } from '@/lib/outcome-buckets';
import { ApprovalQueue } from './approval-queue';
import { AttentionRow, RunStateChip } from './attention-row';
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
    <main className="page-fill mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="ภาพรวม"
        description="สิ่งที่ต้องดูแล รายการรอตรวจสอบ และสถานะของประกาศที่ดึงเข้าระบบ"
        meta={asOf ? <span>อัปเดตเมื่อ {clock(asOf)}</span> : null}
      />

      {error ? <AdminLoadError error={error} onRetry={retry} /> : null}

      {loading ? <DashboardSkeleton /> : null}

      {summary && asOf ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="flex min-w-0 flex-col gap-10">
            <div className="flex flex-col gap-4">
              <RunStateChip state={runState(summary, asOf)} />
              <AttentionRow chips={attentionChips(summary, failures, asOf)} />
            </div>

            <KpiStrip tiles={kpiTiles(summary, asOf)} />

            <ApprovalQueue
              lastRunAt={summary.lastRunAt}
              now={asOf}
              heldCount={summary.byOutcome.needs_review ?? 0}
              onChanged={retry}
            />

            <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
              <h2 id="recent-heading" className="text-base font-semibold">
                อัปเดตล่าสุด
              </h2>
              <RecentActivity items={recent} now={asOf} />
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-10 border-t pt-10 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            <section aria-labelledby="outcome-heading" className="flex flex-col gap-4">
              <h2 id="outcome-heading" className="text-base font-semibold">
                ผลการประมวลผล
              </h2>
              <OutcomeDonut
                buckets={outcomeBuckets(summary.byOutcome)}
                total={summary.total}
                byOutcome={summary.byOutcome}
              />
            </section>
            <section aria-labelledby="health-heading" className="flex flex-col gap-4">
              <h2 id="health-heading" className="text-base font-semibold">
                สถานะระบบ
              </h2>
              <SystemHealth summary={summary} now={asOf} />
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
