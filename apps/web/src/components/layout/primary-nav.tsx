'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@torfun/types';

import { cn } from '@/lib/utils';
import { workspaceNav } from './nav-config';
import { MarketingNav } from './marketing-nav';

/**
 * The header's own navigation, on screens wide enough for it.
 *
 * With no sidebar left, this is the only place a signed-in officer's
 * destinations appear above `lg`; below that the mobile sheet carries them, so
 * the two must stay in step — both read `workspaceNav`.
 *
 * A guest gets the landing page's sections instead, and only while they are on
 * the landing page, because that is the only place those anchors resolve.
 */
export function PrimaryNav({ role }: { role?: UserRole }) {
  const pathname = usePathname();

  if (!role) return <MarketingNav className="ms-2 hidden items-center gap-7 lg:flex" />;

  return (
    <nav aria-label="เมนูหลัก" className="ms-2 hidden items-center gap-1 lg:flex">
      {workspaceNav(role).map(({ href, label, Icon }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'focus-visible:outline-ring inline-flex items-center gap-2 rounded-xl px-3 py-2',
              'text-sm whitespace-nowrap transition-colors focus-visible:outline-2',
              current
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
