import Link from 'next/link';
import { CircleAlert, CircleCheck, CircleX, ChevronRight, SearchCheck } from 'lucide-react';
import {
  summarizeQualificationChecks,
  type QualificationCheck,
  type QualificationMatchResult,
  type TorQualification,
} from '@torfun/types';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  describeMatch,
  REASON_COPY,
  SETUP_TARGETS,
  setupTargetFor,
  type MatchTone,
} from '@/lib/match-explanation';
import { cn } from '@/lib/utils';

const statusLabels = {
  met: 'ตรงเงื่อนไข',
  not_met: 'ไม่ตรงเงื่อนไข',
  unknown: 'ยังสรุปไม่ได้',
};

const toneStyle: Record<MatchTone, { icon: typeof CircleX; className: string }> = {
  good: { icon: CircleCheck, className: 'text-primary' },
  bad: { icon: CircleX, className: 'text-destructive' },
  setup: { icon: CircleAlert, className: 'text-foreground' },
  review: { icon: SearchCheck, className: 'text-foreground' },
};

export function TorQualificationResults({
  qualifications,
  result,
}: {
  qualifications?: TorQualification[];
  result?: QualificationMatchResult | null;
}) {
  const score = result?.overallScore;
  const summary = result ? summarizeQualificationChecks(result.checks, result.budgetRule) : null;
  const verdict = describeMatch(score, summary);
  const Icon = verdict ? toneStyle[verdict.tone].icon : null;
  // The clauses that cost the score are open on arrival; the rest stay one line each.
  const openByDefault = (qualifications ?? []).flatMap((_, index) =>
    result?.checks[index]?.status === 'not_met' ? [String(index)] : [],
  );

  return (
    <Card className="mt-5">
      <CardHeader>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tabular-nums" data-testid="match-score">
            {score == null ? '—' : `${Math.round(score * 100)}%`}
          </span>
          <CardTitle className="text-base">
            {score == null ? 'ยังไม่มีคะแนนคุณสมบัติ' : 'คะแนนคุณสมบัติโดยประมาณ'}
          </CardTitle>
        </div>
        {verdict && Icon && (
          <p
            className={cn(
              'flex items-start gap-2 text-sm font-medium',
              toneStyle[verdict.tone].className,
            )}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {verdict.headline}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          AI อ่านคุณสมบัติจาก TOR ระบบเทียบกับข้อมูลที่บริษัทบันทึกไว้
          โปรดตรวจเงื่อนไขในเอกสารต้นฉบับก่อนตัดสินใจยื่นข้อเสนอ
        </p>
        {result && (
          <p className="text-muted-foreground text-sm">
            คะแนนคิดจากสัดส่วนข้อที่ตรงเงื่อนไขต่อข้อที่สกัดได้ทั้งหมด หากมีข้อใดไม่ตรงเงื่อนไข
            คะแนนเป็น 0% เพราะคุณสมบัติผู้ยื่นข้อเสนอทุกข้อเป็นเงื่อนไขบังคับ
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!!summary?.setupSections.length && (
          <div className="bg-muted/40 mb-4 rounded-lg border p-3 text-sm">
            <p className="font-medium">ข้อมูลบริษัทที่ยังไม่ได้ตั้งค่า</p>
            <p className="text-muted-foreground mt-1">
              บันทึกข้อมูลเหล่านี้เพื่อให้ระบบตรวจเงื่อนไขที่ยังสรุปไม่ได้
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {summary.setupSections.map((section) => (
                <Link
                  key={section}
                  href={SETUP_TARGETS[section].href}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {SETUP_TARGETS[section].label}
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        )}
        {result?.budgetRule && <BudgetRule rule={result.budgetRule} />}
        {qualifications === undefined && (
          <p className="text-muted-foreground text-sm">ยังไม่มีผลการสกัดคุณสมบัติแบบแยกรายข้อ</p>
        )}
        {qualifications?.length === 0 && (
          <p className="text-muted-foreground text-sm">AI ยังไม่พบข้อกำหนดคุณสมบัติในเอกสารนี้</p>
        )}
        {!!qualifications?.length && (
          <Accordion multiple defaultValue={openByDefault} aria-label="คุณสมบัติรายข้อ">
            {qualifications.map((item, index) => (
              <Clause
                key={`${item.source}-${index}`}
                value={String(index)}
                item={item}
                check={result?.checks[index]}
              />
            ))}
          </Accordion>
        )}
        {qualifications && qualifications.length > 0 && (
          <Link
            className="text-primary mt-5 inline-block text-sm underline underline-offset-4"
            href="/company"
          >
            ดูข้อมูลบริษัทที่ใช้เปรียบเทียบ
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetRule({ rule }: { rule: QualificationCheck }) {
  const copy = rule.reason ? REASON_COPY[rule.reason] : null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
      <Badge variant={rule.status === 'not_met' ? 'destructive' : 'outline'}>
        {rule.status === 'met'
          ? 'อยู่ในช่วงงบประมาณที่บริษัทยื่น'
          : rule.status === 'not_met'
            ? 'อยู่นอกช่วงงบประมาณที่บริษัทยื่น'
            : 'ยังเทียบช่วงงบประมาณไม่ได้'}
      </Badge>
      <span className="text-muted-foreground">{rule.evidence.join(' · ')}</span>
      {copy && rule.status !== 'met' && (
        <span className="text-muted-foreground w-full">{copy.hint}</span>
      )}
    </div>
  );
}

function Clause({
  value,
  item,
  check,
}: {
  value: string;
  item: TorQualification;
  check: QualificationCheck | undefined;
}) {
  const reason = check?.reason ? REASON_COPY[check.reason] : null;
  const target = setupTargetFor(check?.reason);
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>
        <span className="grid min-w-0 flex-1 gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={check?.status === 'not_met' ? 'destructive' : 'outline'}>
              {statusLabels[check?.status ?? 'unknown']}
            </Badge>
            {reason && check?.status !== 'met' && (
              <span className="text-muted-foreground text-xs">{reason.title}</span>
            )}
          </span>
          <span className="leading-relaxed">{item.text}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <p className="text-muted-foreground text-xs">อ้างอิง TOR · {item.source}</p>
        {reason && check?.status !== 'met' && <p className="mt-2 leading-relaxed">{reason.hint}</p>}
        {!!check?.evidence.length && (
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 ps-5">
            {check.evidence.map((line, lineIndex) => (
              <li key={lineIndex}>{line}</li>
            ))}
          </ul>
        )}
        {target && (
          <Link
            href={target.href}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3')}
          >
            {check?.status === 'unknown' ? `ตั้งค่า${target.label}` : `ตรวจสอบ${target.label}`}
            <ChevronRight aria-hidden="true" />
          </Link>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
