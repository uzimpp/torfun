'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import {
  DEADLINE_SOURCE_LABELS,
  HOLD_REASON_LABELS,
  MILESTONE_KEYS,
  OUTCOME_LABELS,
  STATUS_LABELS,
  type ArchiveDocument,
  type Procurement,
} from '@torfun/types';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { LoadingRegion } from '@/components/admin/loading-region';
import { StateBadge, StatusBadge } from '@/components/admin/status-badge';
import {
  ProjectActionDialog,
  type ProjectAction,
} from '@/components/ingestion/project-action-dialog';
import { ProjectActionMenu } from '@/components/ingestion/project-action-menu';
import { attemptsLabel, stageDuration } from '@/components/ingestion/status-tracking';
import { TorDownloadButton } from '@/components/tor-review/tor-download-button';
import { buttonVariants } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { LoadError } from '@/lib/api-errors';
import { deadlineText } from '@/lib/deadline-display';
import { formatThaiDate } from '@/lib/format-date';
import { bucketOfOutcome } from '@/lib/outcome-buckets';
import { cn } from '@/lib/utils';
import { MILESTONE_LABELS, formatThb, hasTorSource } from './procurement-format';

const ROLE_LABELS: Record<ArchiveDocument['role'], string> = {
  main_tor: 'TOR หลัก',
  tor_variant: 'TOR ฉบับอื่น',
  not_tor: 'ไม่ใช่ TOR',
  unreadable: 'อ่านไม่ได้',
  invitation: 'ประกาศเชิญชวน',
  bidding_document: 'เอกสารประกวดราคา',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 px-5 py-5">
      <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words', mono && 'font-mono tabular-nums')}>{children}</dd>
    </div>
  );
}

function SourceSection({ record }: { record: Procurement }) {
  return (
    <section className="flex flex-col gap-2 px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        {hasTorSource(record) ? (
          <div className="flex w-full max-w-56">
            <TorDownloadButton projectId={record.projectId} size="sm" />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">ยังไม่มีเอกสาร TOR ต้นฉบับให้เปิด</p>
        )}
        <Link
          href={`/tor/${record.projectId}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          <ExternalLink aria-hidden="true" />
          หน้าตรวจ TOR
        </Link>
      </div>
      <p className="text-muted-foreground text-xs">ตรวจกับเอกสารต้นฉบับก่อนตัดสินใจทุกครั้ง</p>
    </section>
  );
}

function ReviewSection({ record }: { record: Procurement }) {
  if (record.outcome === 'needs_review') {
    return (
      <Section title="รอตรวจสอบ">
        <p className="text-sm">
          {record.holdReason ? HOLD_REASON_LABELS[record.holdReason] : 'ไม่ได้ระบุเหตุผล'}
        </p>
      </Section>
    );
  }
  if (record.approvedBy) {
    return (
      <Section title="การอนุมัติ">
        <p className="text-sm">
          อนุมัติโดย {record.approvedBy}
          {record.approvedAt ? (
            <span className="text-muted-foreground">
              {' '}
              · {formatThaiDate(record.approvedAt, { withTime: true })}
            </span>
          ) : null}
        </p>
      </Section>
    );
  }
  return null;
}

function AnalysisSection({ record }: { record: Procurement }) {
  const { analysis } = record;
  return (
    <Section title="สรุปจาก AI (สรุป ไม่ใช่ข้อยืนยัน)">
      {analysis ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="leading-relaxed break-words">{analysis.summary}</p>
          {analysis.scopeOfWork.length > 0 ? (
            <ul className="text-muted-foreground list-disc space-y-1 pl-5">
              {analysis.scopeOfWork.map((item, index) => (
                <li key={index} className="break-words">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
          {analysis.techStack.length > 0 ? (
            <p className="text-muted-foreground break-words">
              เทคโนโลยี: {analysis.techStack.join(', ')}
            </p>
          ) : null}
          {analysis.reason ? (
            <p className="text-muted-foreground break-words">เหตุผลจาก AI: {analysis.reason}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">ยังไม่มีสรุปจาก AI สำหรับประกาศนี้</p>
      )}
    </Section>
  );
}

function FactsSection({ record }: { record: Procurement }) {
  const area = [record.subdistrict, record.district, record.province].filter(Boolean).join(' ');
  return (
    <Section title="ข้อมูลจาก e-GP">
      <dl className="divide-y">
        <Fact label="หน่วยงาน">
          {record.deptName}
          {record.deptSubName ? (
            <span className="text-muted-foreground block">{record.deptSubName}</span>
          ) : null}
        </Fact>
        {area ? <Fact label="พื้นที่">{area}</Fact> : null}
        <Fact label="สถานะโครงการ">{STATUS_LABELS[record.status]}</Fact>
        <Fact label="ปีงบประมาณ" mono>
          {record.budgetYear}
        </Fact>
        <Fact label="งบประมาณ (บาท)" mono>
          {formatThb(record.projectMoney)}
        </Fact>
        <Fact label="ราคากลาง (บาท)" mono>
          {formatThb(record.priceBuild)}
        </Fact>
        {record.projectTypeName ? <Fact label="ประเภท">{record.projectTypeName}</Fact> : null}
        {record.purchaseMethodName ? (
          <Fact label="วิธีจัดหา">{record.purchaseMethodName}</Fact>
        ) : null}
        {record.announceDate ? (
          <Fact label="วันที่ประกาศ">{formatThaiDate(record.announceDate)}</Fact>
        ) : null}
        {record.winner ? (
          <Fact label="ผู้ชนะ">
            {record.winner.name}
            {record.winner.priceAgree !== null ? (
              <span className="text-muted-foreground block font-mono tabular-nums">
                {formatThb(record.winner.priceAgree)} บาท
              </span>
            ) : null}
          </Fact>
        ) : null}
      </dl>
    </Section>
  );
}

function TimelineSection({ record }: { record: Procurement }) {
  return (
    <Section title="กำหนดการ">
      <p className="text-sm">
        <span className="text-muted-foreground">กำหนดยื่นข้อเสนอ </span>
        <span className="font-medium">{deadlineText(record.deadlineAt, record.status)}</span>
        {record.deadlineSource ? (
          <span className="text-muted-foreground block text-xs">
            ที่มา: {DEADLINE_SOURCE_LABELS[record.deadlineSource]}
          </span>
        ) : null}
      </p>
      <ol aria-label="ขั้นตอนใน e-GP" className="flex flex-col gap-1.5 border-l pl-4">
        {MILESTONE_KEYS.map((key) => {
          const milestone = record.milestones[key];
          return (
            <li key={key} className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className={milestone ? undefined : 'text-muted-foreground'}>
                {MILESTONE_LABELS[key]}
              </span>
              <span className="text-muted-foreground text-xs">
                {milestone
                  ? milestone.at
                    ? formatThaiDate(milestone.at)
                    : 'ถึงแล้ว ไม่ระบุวันที่'
                  : 'ยังไม่ถึง'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground text-xs">
        {record.timelineCheckedAt
          ? `อ่านไทม์ไลน์ล่าสุด ${formatThaiDate(record.timelineCheckedAt, { withTime: true })}`
          : 'ยังไม่เคยอ่านไทม์ไลน์ของโครงการนี้'}
      </p>
    </Section>
  );
}

function DocumentsSection({ record }: { record: Procurement }) {
  if (record.documents.length === 0) return null;
  return (
    <Section title="เอกสารในไฟล์บีบอัด">
      {record.torAmbiguous ? (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          พบเอกสารที่อ้างเป็น TOR มากกว่าหนึ่งฉบับ ระบบเลือกตามแบบแผนชื่อไฟล์ โปรดตรวจสอบ
        </p>
      ) : null}
      <ul className="flex flex-col divide-y">
        {record.documents.map((file) => (
          <li key={file.member} className="flex flex-col gap-0.5 py-2 text-sm">
            <span className="font-medium break-all">{file.filename}</span>
            <span className="text-muted-foreground text-xs">
              {ROLE_LABELS[file.role]}
              {file.namePattern === 'loose' ? ' · ชื่อไฟล์ไม่ตรงแบบแผน' : ''} ·{' '}
              <span className="font-mono tabular-nums">
                {(file.bytes / 1024 / 1024).toFixed(1)} MB
              </span>
            </span>
            {file.note ? (
              <span className="text-muted-foreground text-xs break-words">{file.note}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function HistorySection({ record }: { record: Procurement }) {
  if (record.statusHistory.length === 0) return null;
  return (
    <Section title="ประวัติสถานะ">
      <ol aria-label="ประวัติสถานะ" className="flex flex-col gap-2">
        {[...record.statusHistory].reverse().map((change, index) => (
          <li key={`${change.at}-${index}`} className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge state={change.state} />
              <span>{OUTCOME_LABELS[change.outcome]}</span>
              <span className="text-muted-foreground text-xs">
                {formatThaiDate(change.at, { withTime: true })}
              </span>
            </div>
            {change.detail ? (
              <p className="text-destructive text-xs break-words">{change.detail}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function DrawerSkeleton() {
  return (
    <LoadingRegion className="flex flex-col gap-4 px-5 py-5">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-4 h-24 w-full" />
    </LoadingRegion>
  );
}

/** Where the record is in the pipeline: how long in this stage, and tries used. */
function StatusLine({ record, now }: { record: Procurement; now: Date }) {
  const duration = stageDuration(record, now);
  const attempts = attemptsLabel(record.attempts);
  return (
    <div
      role="group"
      aria-label="สถานะการประมวลผล"
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <StatusBadge bucket={bucketOfOutcome(record.outcome)} />
      <span className="text-muted-foreground text-xs">{OUTCOME_LABELS[record.outcome]}</span>
      {duration ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs',
            duration.overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {duration.overdue ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : null}
          {duration.label}
        </span>
      ) : null}
      {attempts ? (
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{attempts}</span>
      ) : null}
    </div>
  );
}

/**
 * One record in full, beside the list it was opened from. The source document
 * comes first and the model's reading is labelled as a summary: a person
 * checks it against the original before acting.
 */
export function ProcurementDrawer({
  open,
  record,
  error,
  now,
  onRetry,
  onClose,
  onActionDone,
}: {
  open: boolean;
  record: Procurement | null;
  error: LoadError | null;
  /** What "in this stage for N minutes" is measured to. */
  now: Date;
  onRetry: () => void;
  onClose: () => void;
  /** After the API accepted an action, so the list (and this record) can be read again. */
  onActionDone: (action: ProjectAction) => void;
}) {
  const [acting, setActing] = useState<ProjectAction | null>(null);

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto overscroll-contain p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <header className="flex flex-col gap-2 border-b px-5 pt-5 pr-14 pb-4">
          {record ? (
            <>
              <StatusLine record={record} now={now} />
              <SheetTitle className="text-lg leading-snug font-semibold break-words">
                {record.projectName}
              </SheetTitle>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SheetDescription className="font-mono text-xs tabular-nums">
                  {record.projectId}
                </SheetDescription>
                <ProjectActionMenu record={record} onChoose={setActing} />
              </div>
            </>
          ) : (
            <>
              <SheetTitle className="text-lg font-semibold">รายละเอียดประกาศ</SheetTitle>
              <SheetDescription className="text-xs">
                {error ? 'โหลดรายละเอียดไม่สำเร็จ' : 'กำลังโหลดรายละเอียด'}
              </SheetDescription>
            </>
          )}
        </header>

        {record ? (
          <div className="flex flex-col divide-y">
            <SourceSection record={record} />
            <ReviewSection record={record} />
            <AnalysisSection record={record} />
            <TimelineSection record={record} />
            <FactsSection record={record} />
            <DocumentsSection record={record} />
            <HistorySection record={record} />
          </div>
        ) : error ? (
          <div className="px-5 py-5">
            <AdminLoadError error={error} onRetry={onRetry} />
          </div>
        ) : (
          <DrawerSkeleton />
        )}

        {record && acting ? (
          <ProjectActionDialog
            record={record}
            action={acting}
            onClose={() => setActing(null)}
            onDone={() => onActionDone(acting)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
