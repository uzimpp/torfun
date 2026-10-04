'use client';

import { ExternalLink } from 'lucide-react';
import type { OpenDataQuota } from '@torfun/types';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { LoadingRegion } from '@/components/admin/loading-region';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatThaiDate } from '@/lib/format-date';
import { quotaFigure, todaysQuota } from '@/lib/open-data-quota';
import { FailureLog } from './failure-log';
import { LiveWork } from './live-work';
import { OpsCharts } from './ops-charts';
import { OpsTiles } from './ops-tiles';
import { QuotaMeter } from './quota-meter';
import { RunBanner } from './run-banner';
import { ScheduleCard } from './schedule-card';
import { runBanner } from './status-tracking';
import { useIngestionOps } from './use-ingestion-ops';
import { useIngestionRun } from './use-ingestion-run';
import { useNow } from './use-now';

function quotaFigureToday(quota: OpenDataQuota | null, now: Date): string {
  const current = todaysQuota(quota, now);
  return current ? quotaFigure(current) : 'ยังไม่ทราบ';
}

const CLOUD_RUN_CONSOLE = 'https://console.cloud.google.com/run';

const clock = (at: Date) =>
  at.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Bangkok',
  });

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function MonitoringSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-10">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-8 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 w-full" />
        ))}
      </div>
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
    <main className="page-fill mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
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
          <Button
            onClick={() => void startRun()}
            disabled={running || starting}
            aria-busy={starting || undefined}
            className="active:translate-y-px"
          >
            เริ่มรอบดึงข้อมูล
          </Button>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <div className="flex min-w-0 flex-col gap-10">
          {banner ? <RunBanner banner={banner} onStop={stopRun} /> : null}

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

          <Section id="live-heading" title="งานที่กำลังทำ">
            {ops || !opsData.loading ? (
              <LiveWork live={ops?.live ?? null} now={now} />
            ) : (
              <LoadingRegion>
                <Skeleton className="h-12 w-full" />
              </LoadingRegion>
            )}
          </Section>

          {ops ? (
            <>
              <Section id="metrics-heading" title="ตัวชี้วัด">
                <OpsTiles ops={ops} />
                <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-5 text-xs">
                  <li>
                    เวลาต่อรายการนับเฉพาะรายการที่ดาวน์โหลดเอกสาร ไม่รวมรายการที่ถูกคัดออก
                    และรายการที่อัปเดตไทม์ไลน์อย่างเดียว
                  </li>
                  <li>โทเคนไม่รวมการเรียก AI ที่ล้มเหลว เพราะ API ไม่ส่งข้อมูลการใช้งานกลับมา</li>
                  <li>หน่วยความจำเป็นของอินสแตนซ์ที่รันงานนี้เท่านั้น</li>
                </ul>
              </Section>

              <Section id="trends-heading" title="แนวโน้ม">
                <OpsCharts ops={ops} now={now} />
              </Section>
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

        <aside className="flex min-w-0 flex-col gap-8 border-t pt-10 lg:sticky lg:top-[calc(var(--header-h)+2.5rem)] lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          {summary ? (
            <QuotaMeter quota={summary.openDataQuota} now={now} />
          ) : (
            <LoadingRegion>
              <Skeleton className="h-8 w-full" />
            </LoadingRegion>
          )}
          <ScheduleCard />
          <div className="flex flex-col gap-1 text-xs">
            <a
              href={CLOUD_RUN_CONSOLE}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 underline-offset-4 hover:underline"
            >
              ดูประวัติหน่วยความจำใน Cloud Run
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <p className="text-muted-foreground">
              หน้านี้แสดงเฉพาะค่าล่าสุดและค่าสูงสุดของแต่ละรอบ
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
