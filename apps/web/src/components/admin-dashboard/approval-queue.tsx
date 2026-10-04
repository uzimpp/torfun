'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, SearchCheck } from 'lucide-react';
import { DEADLINE_SOURCE_LABELS, HOLD_REASON_LABELS, type Procurement } from '@torfun/types';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { ConfirmDialog } from '@/components/ingestion/confirm-dialog';
import { procurementsHref } from '@/components/procurements/procurement-filter-values';
import { formatThb, hasTorSource } from '@/components/procurements/procurement-format';
import { ProcurementStatusBadge } from '@/components/search/procurement-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { deadlineText } from '@/lib/deadline-display';
import { cn } from '@/lib/utils';
import { SourceTorButton } from './source-tor-button';
import { useApprovalQueue, type Decision, type QueueEntry } from './use-approval-queue';
import { timeAgoTh } from './view-models';
import { formatCount } from '@/lib/format-number';

/** Rows on the dashboard; the rest are one link away. */
export const QUEUE_SHOWN = 8;

const NOT_SENT = { pending: false, error: null, sessionEnded: false } as const;

const CONFIRM: Record<Decision, { title: string; description: string; label: string }> = {
  approve: {
    title: 'อนุมัติให้เจ้าหน้าที่เห็นโครงการนี้?',
    description:
      'โครงการจะแสดงให้เจ้าหน้าที่ฝ่ายพัฒนาธุรกิจทันที ระบบจะบันทึกผู้อนุมัติและเวลา ตรวจกับ TOR ต้นฉบับก่อนอนุมัติ',
    label: 'อนุมัติ',
  },
  nonSoftware: {
    title: 'ระบุว่าไม่ใช่งานซอฟต์แวร์?',
    description:
      'เนื้อหาที่อ่านจาก TOR จะถูกลบ และโครงการจะถูกบันทึกใน Tombstone เพื่อไม่ให้ดึงซ้ำ หากเปลี่ยนใจภายหลัง ต้องนำออกจาก Tombstone แล้วรอให้รอบดึงข้อมูลดาวน์โหลดและอ่าน TOR ใหม่ทั้งหมด',
    label: 'ระบุว่าไม่ใช่ซอฟต์แวร์',
  },
};

/**
 * Held records waiting for a person, most urgent first. Each one carries the
 * way to the source document ahead of the decision, because the model's reading
 * is a summary to check, not a finding.
 */
export function ApprovalQueue({
  lastRunAt,
  now,
  heldCount,
  onChanged,
}: {
  lastRunAt: string | null;
  now: Date;
  /** The summary's held count; when a run changes it, the queue reads again. */
  heldCount: number;
  /** After a decision went through, so the counts around the queue read again. */
  onChanged: () => void;
}) {
  const { entries, total, loadError, retry, decide, announcement } = useApprovalQueue(
    onChanged,
    heldCount,
  );
  const [acting, setActing] = useState<{ record: Procurement; decision: Decision } | null>(null);

  const confirm = () => {
    if (!acting) return;
    setActing(null);
    void decide(acting.record, acting.decision);
  };

  return (
    <section aria-labelledby="approval-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="approval-heading" className="flex items-baseline gap-2 text-base font-semibold">
          รอตรวจสอบ
          {entries !== null && total > 0 ? (
            <span className="text-muted-foreground font-mono text-sm font-normal tabular-nums">
              {formatCount(total)}
            </span>
          ) : null}
        </h2>
        {entries !== null && total > 0 ? (
          <Link
            href={procurementsHref({ outcome: 'needs_review' })}
            className="text-primary rounded-sm text-sm underline-offset-4 hover:underline"
          >
            ดูทั้งหมด ({formatCount(total)})
          </Link>
        ) : null}
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">
        AI ไม่มั่นใจหรืออ่านเอกสารได้ไม่ครบ เจ้าหน้าที่ยังไม่เห็นจนกว่าจะอนุมัติ
      </p>

      <div role="status" aria-live="polite" className={announcement ? undefined : 'sr-only'}>
        {announcement ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {announcement}
          </p>
        ) : null}
      </div>

      {loadError ? (
        <AdminLoadError error={loadError} onRetry={retry} />
      ) : entries === null ? (
        <QueueSkeleton />
      ) : entries.length === 0 ? (
        <EmptyQueue lastRunAt={lastRunAt} now={now} />
      ) : (
        <ul className="bg-card divide-y rounded-xl border">
          {entries.slice(0, QUEUE_SHOWN).map((entry) => (
            <QueueItem
              key={entry.record.projectId}
              entry={entry}
              onChoose={(decision) => setActing({ record: entry.record, decision })}
            />
          ))}
        </ul>
      )}

      {acting ? (
        <ConfirmDialog
          title={CONFIRM[acting.decision].title}
          description={
            <>
              <span className="block font-medium break-words">{acting.record.projectName}</span>
              {CONFIRM[acting.decision].description}
            </>
          }
          confirmLabel={CONFIRM[acting.decision].label}
          destructive={acting.decision === 'nonSoftware'}
          action={NOT_SENT}
          onConfirm={confirm}
          onCancel={() => setActing(null)}
        />
      ) : null}
    </section>
  );
}

function QueueItem({
  entry: { record, busy, error },
  onChoose,
}: {
  entry: QueueEntry;
  onChoose: (decision: Decision) => void;
}) {
  const headingId = `held-${record.projectId}`;

  return (
    <li
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      className={cn(
        'flex flex-col gap-3 px-4 py-4 transition-opacity motion-reduce:transition-none sm:px-5',
        busy && 'opacity-50',
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
          <ProcurementStatusBadge status={record.status} />
          <h3 id={headingId} className="min-w-0 flex-1 text-sm font-medium break-words">
            {record.projectName}
          </h3>
        </div>
        <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <span className="break-words">{record.deptName}</span>
          <span className="font-mono tabular-nums">
            {record.projectMoney === null
              ? 'ไม่ระบุงบประมาณ'
              : `${formatThb(record.projectMoney)} บาท`}
          </span>
          <Deadline record={record} />
        </p>
      </div>

      {record.holdReason ? (
        <p className="flex items-start gap-2 text-sm">
          <SearchCheck
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          {HOLD_REASON_LABELS[record.holdReason]}
        </p>
      ) : null}

      {record.analysis?.reason || record.analysis?.summary ? (
        <div className="border-border flex flex-col gap-1 border-l-2 pl-3">
          {record.analysis.reason ? (
            <>
              <p className="text-muted-foreground text-xs">เหตุผลจาก AI (สรุป ไม่ใช่ข้อยืนยัน)</p>
              <p className="text-sm break-words">{record.analysis.reason}</p>
            </>
          ) : null}
          {record.analysis.summary ? (
            <p className="text-muted-foreground line-clamp-2 text-sm break-words">
              {record.analysis.summary}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {hasTorSource(record) ? (
          <SourceTorButton projectId={record.projectId} />
        ) : (
          <span className="text-muted-foreground text-xs">ยังไม่มีเอกสาร TOR ต้นฉบับ</span>
        )}
        <Button size="sm" disabled={busy} onClick={() => onChoose('approve')}>
          อนุมัติ
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onChoose('nonSoftware')}>
          ระบุว่าไม่ใช่ซอฟต์แวร์
        </Button>
        <Link
          href={procurementsHref({ id: record.projectId })}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          ดูรายละเอียด
        </Link>
      </div>

      {error ? (
        <AdminLoadError
          error={error}
          title={error.kind === 'unreachable' ? undefined : 'ดำเนินการไม่สำเร็จ'}
        />
      ) : null}
    </li>
  );
}

function Deadline({ record }: { record: Procurement }) {
  if (!record.deadlineAt) {
    return (
      <span>
        {record.status === 'drafting'
          ? deadlineText(null, record.status)
          : 'ยังไม่ทราบกำหนดยื่นข้อเสนอ'}
      </span>
    );
  }
  return (
    <span>
      ยื่นข้อเสนอภายใน{' '}
      <time dateTime={record.deadlineAt} className="text-foreground">
        {deadlineText(record.deadlineAt, record.status)}
      </time>
      {record.deadlineSource ? ` · ตาม${DEADLINE_SOURCE_LABELS[record.deadlineSource]}` : null}
    </span>
  );
}

function EmptyQueue({ lastRunAt, now }: { lastRunAt: string | null; now: Date }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed px-5 py-6">
      <CheckCircle2 className="text-muted-foreground size-5" aria-hidden="true" />
      <p className="text-sm font-medium">ไม่มีรายการรอตรวจสอบ</p>
      <p className="text-muted-foreground font-mono text-xs tabular-nums">
        {lastRunAt ? `รอบล่าสุด ${timeAgoTh(lastRunAt, now)}` : 'ยังไม่เคยดึงข้อมูล'}
      </p>
      <Link
        href="/admin/ingestion"
        className="text-primary rounded-sm text-sm underline-offset-4 hover:underline"
      >
        ไปที่ระบบดึงข้อมูล
      </Link>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="กำลังโหลดรายการรอตรวจสอบ"
      className="bg-card divide-y rounded-xl border"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}
