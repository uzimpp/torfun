import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatCount } from '@/lib/format-number';
import { cn } from '@/lib/utils';

/**
 * The few pieces every admin page shares, so a heading, a figure or an empty
 * state reads the same on each one. Sizes and weights follow `AGENTS.md` §
 * Typography.
 */

/** A link inside admin chrome: primary, underlined on hover. */
export const ADMIN_LINK =
  'text-primary inline-flex w-fit items-center gap-1.5 rounded-sm text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** A record's name as a link in a list or table row. */
export const RECORD_LINK =
  'line-clamp-2 rounded-sm text-left text-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** "ดูเป็นตาราง" and the like: a quiet toggle under a chart. */
export const DISCLOSURE =
  'text-muted-foreground hover:text-foreground w-fit cursor-pointer rounded-sm text-xs underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Table header cells, on every admin table. */
export const TABLE_HEAD = 'text-muted-foreground text-xs font-medium';

/** Same width and gutters as the site header, on all four admin pages. */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={cn(
        'page-fill mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10',
        className,
      )}
    >
      {children}
    </main>
  );
}

export function SectionHeading({
  id,
  icon: Icon,
  count,
  children,
}: {
  id?: string;
  icon?: LucideIcon;
  /** Shown beside the title in muted figures; omitted when undefined. */
  count?: number;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="flex min-w-0 items-center gap-2 text-base font-medium">
      {Icon ? <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> : null}
      {children}
      {count !== undefined ? (
        <span className="text-muted-foreground text-sm font-normal tabular-nums">
          {formatCount(count)}
        </span>
      ) : null}
    </h2>
  );
}

/** A titled block: heading (with an optional action on its right), one line of description, content. */
export function AdminSection({
  id,
  title,
  icon,
  count,
  description,
  action,
  className,
  children,
}: {
  id: string;
  title: string;
  icon?: LucideIcon;
  count?: number;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-4', className)}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <SectionHeading id={id} icon={icon} count={count}>
            {title}
          </SectionHeading>
          {action}
        </div>
        {description ? (
          <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A headline figure: KPI tiles, chart totals, the donut's centre. */
export function StatValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-2xl font-medium break-words tabular-nums', className)}>
      {children}
    </span>
  );
}

/** Icon, one sentence, an optional hint and action. The caller draws the frame. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-4 py-10 text-center', className)}>
      <Icon aria-hidden="true" className="text-muted-foreground size-6" />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-muted-foreground max-w-sm text-xs">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
