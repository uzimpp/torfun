'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { QualificationSummary } from '@torfun/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { describeMatch, SETUP_TARGETS, type MatchTone } from '@/lib/match-explanation';
import { cn } from '@/lib/utils';

const toneClass: Record<MatchTone, string> = {
  good: 'text-primary',
  bad: 'text-destructive',
  setup: 'text-foreground',
  review: 'text-muted-foreground',
};

/**
 * The score's reason on a result row, with a [>] that opens the breakdown.
 * The row is one big link, so this sits above it and takes its own clicks.
 */
export function MatchReason({
  score,
  summary,
  detailHref,
}: {
  score: number | null | undefined;
  summary: QualificationSummary | null | undefined;
  detailHref: string;
}) {
  const verdict = describeMatch(score, summary);
  if (!verdict || !summary) return null;

  return (
    <div className="pointer-events-auto flex items-start gap-1.5 text-xs">
      <span className={cn('min-w-0 font-medium', toneClass[verdict.tone])}>{verdict.headline}</span>
      <Popover>
        <PopoverTrigger
          aria-label="ดูเหตุผลของคะแนน"
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 aria-expanded:bg-muted -my-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
        >
          <ChevronRight
            aria-hidden="true"
            className="size-4 transition-transform in-aria-expanded:rotate-90"
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 text-sm">
          <ul className="grid gap-1">
            <Line label="ตรงเงื่อนไข" count={summary.met} />
            <Line label="ไม่ตรงเงื่อนไข" count={summary.notMet} />
            <Line label="รอบันทึกข้อมูลบริษัท" count={summary.needsSetup} />
            <Line label="ต้องตรวจในเอกสารต้นฉบับ" count={summary.needsReview} />
          </ul>
          {summary.budgetOutsideRange && (
            <p className="text-destructive">งบประมาณอยู่นอกช่วงที่บริษัทยื่น</p>
          )}
          {!!summary.setupSections.length && (
            <div className="flex flex-wrap gap-1.5">
              {summary.setupSections.map((section) => (
                <Link
                  key={section}
                  href={SETUP_TARGETS[section].href}
                  className="border-border hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                >
                  ตั้งค่า{SETUP_TARGETS[section].label}
                  <ChevronRight aria-hidden="true" className="size-3" />
                </Link>
              ))}
            </div>
          )}
          <Link href={detailHref} className="text-primary underline underline-offset-4">
            ดูรายข้อใน TOR
          </Link>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Line({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <li className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{count} ข้อ</span>
    </li>
  );
}
