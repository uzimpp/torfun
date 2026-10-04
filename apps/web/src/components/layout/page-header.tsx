import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  /** Omitted on the current page. */
  href?: Route;
}

/**
 * The admin pages' header: breadcrumb, h1, at most one line of description,
 * a mono meta row, and the primary action on the h1's baseline.
 */
export function PageHeader({
  crumbs,
  title,
  description,
  meta,
  actions,
  className,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  /** Counts, times, quota: set in mono. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-2', className)}>
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="breadcrumb">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-foreground rounded-sm underline-offset-4 hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="text-muted-foreground max-w-prose text-sm">{description}</p> : null}
      {meta ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
          {meta}
        </div>
      ) : null}
    </header>
  );
}
