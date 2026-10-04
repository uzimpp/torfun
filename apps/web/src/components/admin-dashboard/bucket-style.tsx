import {
  CheckCircle2,
  Clock,
  FileX2,
  Loader2,
  SearchCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { BucketKey } from '@/lib/outcome-buckets';

/**
 * How each outcome bucket looks. These are states, not series, so the colours
 * follow their meaning — good, neutral, warning, critical, waiting, active —
 * and each is paired with an icon and always with a text label: colour alone
 * never carries which bucket a segment is.
 *
 * Every bucket has its own dark-mode step rather than one colour flipped, since
 * a hue that reads on white washes out on the dark surface.
 */
export interface BucketStyle {
  /** Stroke for the donut arc. */
  stroke: string;
  /** Fill for the legend swatch; the same colour as the arc. */
  swatch: string;
  icon: LucideIcon;
  /** Only the running bucket spins, and only for people who have not asked for less motion. */
  iconClass?: string;
}

export const BUCKET_STYLE: Record<BucketKey, BucketStyle> = {
  analysed: {
    stroke: 'stroke-emerald-600 dark:stroke-emerald-400',
    swatch: 'bg-emerald-600 dark:bg-emerald-400',
    icon: CheckCircle2,
  },
  needsReview: {
    stroke: 'stroke-violet-600 dark:stroke-violet-400',
    swatch: 'bg-violet-600 dark:bg-violet-400',
    icon: SearchCheck,
  },
  noTor: {
    stroke: 'stroke-amber-500 dark:stroke-amber-400',
    swatch: 'bg-amber-500 dark:bg-amber-400',
    icon: FileX2,
  },
  failed: {
    stroke: 'stroke-destructive',
    swatch: 'bg-destructive',
    icon: XCircle,
  },
  queued: {
    stroke: 'stroke-zinc-400 dark:stroke-zinc-500',
    swatch: 'bg-zinc-400 dark:bg-zinc-500',
    icon: Clock,
  },
  running: {
    stroke: 'stroke-primary',
    swatch: 'bg-primary',
    icon: Loader2,
    iconClass: 'motion-safe:animate-spin',
  },
};
