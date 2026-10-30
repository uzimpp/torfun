import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { STATUS_STYLE } from '@/components/admin/status-badge';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';
import type { AttentionChip, RunState } from './view-models';

const CHIP =
  'inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1 text-sm outline-none hover:bg-muted active:bg-muted/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:transition-colors';

/** Whether a Run is going, or when the last one was; it opens the ingestion page. */
export function RunStateChip({ state }: { state: RunState }) {
  return (
    <Link href="/admin/ingestion" className={cn(CHIP, 'bg-card w-fit')}>
      <span
        aria-hidden="true"
        className={
          state.running
            ? 'bg-primary size-2 shrink-0 rounded-full motion-safe:animate-pulse'
            : 'bg-muted-foreground/50 size-2 shrink-0 rounded-full'
        }
      />
      <span className={state.running ? 'text-primary font-medium' : undefined}>{state.label}</span>
      {state.detail ? (
        <span className="text-muted-foreground text-xs tabular-nums">{state.detail}</span>
      ) : null}
    </Link>
  );
}

/** "ต้องดูแล": one chip per thing to look at, or a plain all-clear. */
export function AttentionRow({ chips }: { chips: AttentionChip[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-muted-foreground text-sm">ต้องดูแล</h2>
      {chips.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CheckCircle2 className={cn('size-4', STATUS_STYLE.analysed.text)} aria-hidden="true" />
          ทุกอย่างปกติ
        </p>
      ) : (
        <ul aria-label="ต้องดูแล" className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <Link href={chip.href} className={cn(CHIP, 'bg-card')}>
                <AlertTriangle
                  className={cn('size-4 shrink-0', STATUS_STYLE.needsReview.text)}
                  aria-hidden="true"
                />
                <span className="break-words">{chip.label}</span>
                {chip.count !== undefined ? (
                  <span className="font-medium tabular-nums">{formatCount(chip.count)}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
