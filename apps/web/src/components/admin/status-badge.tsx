import {
  CheckCircle2,
  Circle,
  Clock,
  FileX2,
  SearchCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  OUTCOME_LABELS,
  STATE_LABELS,
  type IngestionOutcome,
  type IngestionState,
} from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { formatCount } from '@/lib/format-number';
import { BUCKET_LABELS, bucketOfOutcome, type BucketKey } from '@/lib/outcome-buckets';
import { cn } from '@/lib/utils';

/**
 * The one colour map for where a procurement stands, used by every admin badge,
 * chart and legend. Colour is never the only signal: each use carries a label.
 */
export interface StatusStyle {
  badge: string;
  /** Dot and legend swatch. */
  dot: string;
  /** Donut arc. */
  stroke: string;
  /** Chart bar. */
  fill: string;
  icon: LucideIcon;
  iconClass?: string;
  /** Processing: the dot (or icon) pulses, motion-safe only. Never a spinner. */
  pulse?: boolean;
}

export const STATUS_STYLE: Record<BucketKey, StatusStyle> = {
  queued: {
    badge: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
    stroke: 'stroke-zinc-400 dark:stroke-zinc-500',
    fill: 'fill-zinc-400 dark:fill-zinc-500',
    icon: Clock,
  },
  running: {
    badge: 'bg-primary/10 text-primary',
    dot: 'bg-primary',
    stroke: 'stroke-primary',
    fill: 'fill-primary',
    icon: Circle,
    iconClass: 'scale-50 fill-current motion-safe:animate-pulse',
    pulse: true,
  },
  analysed: {
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
    stroke: 'stroke-emerald-600 dark:stroke-emerald-400',
    fill: 'fill-emerald-600 dark:fill-emerald-400',
    icon: CheckCircle2,
  },
  needsReview: {
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    dot: 'bg-amber-500 dark:bg-amber-400',
    stroke: 'stroke-amber-500 dark:stroke-amber-400',
    fill: 'fill-amber-500 dark:fill-amber-400',
    icon: SearchCheck,
  },
  noTor: {
    badge: 'border-zinc-300 bg-transparent text-zinc-600 dark:border-zinc-700 dark:text-zinc-400',
    dot: 'border border-zinc-400 bg-transparent dark:border-zinc-500',
    stroke: 'stroke-zinc-300 dark:stroke-zinc-600',
    fill: 'fill-zinc-300 dark:fill-zinc-600',
    icon: FileX2,
  },
  failed: {
    badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    dot: 'bg-red-600 dark:bg-red-400',
    stroke: 'stroke-red-600 dark:stroke-red-400',
    fill: 'fill-red-600 dark:fill-red-400',
    icon: XCircle,
  },
};

const ZERO_BADGE = 'bg-muted text-muted-foreground';

const STATE_BUCKET: Record<IngestionState, BucketKey> = {
  Queued: 'queued',
  Processing: 'running',
  Completed: 'analysed',
  Failed: 'failed',
};

export function bucketOfState(state: IngestionState): BucketKey {
  return STATE_BUCKET[state];
}

/**
 * A pill in the bucket's colour. `count` turns it into a counter, which goes
 * grey at zero so nothing reads as a problem when there is none.
 */
export function StatusBadge({
  bucket,
  label = BUCKET_LABELS[bucket],
  count,
  className,
}: {
  bucket: BucketKey;
  label?: string;
  count?: number;
  className?: string;
}) {
  const style = STATUS_STYLE[bucket];
  const zero = count === 0;

  return (
    <Badge className={cn(zero ? ZERO_BADGE : style.badge, className)}>
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          zero ? 'bg-muted-foreground/50' : style.dot,
          style.pulse && !zero && 'motion-safe:animate-pulse',
        )}
      />
      {label}
      {count !== undefined ? (
        <span className="font-mono tabular-nums">{formatCount(count)}</span>
      ) : null}
    </Badge>
  );
}

export function StateBadge({ state }: { state: IngestionState }) {
  return <StatusBadge bucket={bucketOfState(state)} label={STATE_LABELS[state]} />;
}

/** The finer outcome, coloured by the bucket it counts in. */
export function OutcomeBadge({ outcome }: { outcome: IngestionOutcome }) {
  return <StatusBadge bucket={bucketOfOutcome(outcome)} label={OUTCOME_LABELS[outcome]} />;
}
