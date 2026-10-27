'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@torfun/types';

import { cn } from '@/lib/utils';
import { plannedNav, workspaceNav } from './nav-config';

/**
 * The workspace destinations, as a vertical list for the mobile sheet. The
 * header renders the same list horizontally above `lg`; this one adds the
 * planned routes, which need a line of explanation that a compact bar has no
 * room for. `onNavigate` lets the sheet close itself once a link is followed.
 */
export function WorkspaceNav({
  role,
  onNavigate,
  showHints = false,
}: {
  role?: UserRole;
  onNavigate?: () => void;
  /** The sheet has room for a line explaining each destination; the sidebar does not. */
  showHints?: boolean;
}) {
  const pathname = usePathname();
  if (!role) return null;

  return (
    <div className="flex flex-col gap-1">
      {workspaceNav(role).map(({ href, label, Icon, hint }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'group focus-visible:outline-ring relative flex min-h-12 items-center gap-3 rounded-xl px-3',
              'text-sm transition-colors duration-200 focus-visible:outline-2',
              current
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {/* The active marker is a rail, not a filled block: it reads at a
                glance without turning the item into a second button. */}
            <span
              aria-hidden="true"
              className={cn(
                'bg-primary absolute inset-y-2 start-0 w-0.5 rounded-full transition-opacity',
                current ? 'opacity-100' : 'opacity-0',
              )}
            />
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              {label}
              {showHints && (
                <span className="text-muted-foreground/80 mt-0.5 block text-xs font-normal">
                  {hint}
                </span>
              )}
            </span>
          </Link>
        );
      })}

      {plannedNav.map(({ label, Icon }) => (
        <div
          key={label}
          aria-disabled="true"
          className="text-muted-foreground/70 flex min-h-12 items-center gap-3 px-3 text-sm"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {label}
            <span className="mt-0.5 block text-xs">เร็ว ๆ นี้</span>
          </span>
        </div>
      ))}
    </div>
  );
}
