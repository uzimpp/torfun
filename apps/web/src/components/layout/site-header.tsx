import Link from 'next/link';
import { Bell } from 'lucide-react';

import type { CurrentUser } from '@/lib/auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/auth/theme-toggle';
import { UserMenu } from '@/components/auth/user-menu';
import { cn } from '@/lib/utils';
import { Brand } from './brand';
import { HeaderShell } from './header-shell';
import { HeaderSearch } from './header-search';
import { MarketingNav } from './marketing-nav';
import { MobileMenu } from './mobile-menu';

/**
 * One header for the whole site.
 *
 * Its middle column changes with the route rather than with the visitor: the
 * landing page offers its own sections, every working page offers search. What
 * the visitor changes is the right-hand end — an account menu, or the two ways
 * to get one.
 */
export function SiteHeader({
  user,
  initialTheme = 'light',
}: {
  user: Pick<CurrentUser, 'username' | 'role'> | null;
  initialTheme?: 'light' | 'dark';
}) {
  return (
    <HeaderShell>
      {/* Padding and gaps tighten below `sm` because the narrowest phone this
          has to serve is 320px, and at that width the brand, the menu button
          and the sign-in action together leave nothing spare. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-5 sm:px-6 lg:h-18 lg:px-10">
        <MobileMenu role={user?.role} />
        <Brand href={user ? '/dashboard' : '/'} className="shrink-0" />

        {/* The flexible middle. Exactly one of these ever renders: the
            marketing anchors belong to the landing page, the search field to
            everywhere that is not the landing page or the results page. */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <MarketingNav />
          <HeaderSearch />
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {user && (
            <Button
              disabled
              variant="ghost"
              className="hidden size-10 rounded-xl sm:inline-flex"
              title="การแจ้งเตือน — เร็ว ๆ นี้"
              aria-label="การแจ้งเตือน — เร็ว ๆ นี้"
            >
              <Bell aria-hidden="true" />
            </Button>
          )}
          <ThemeToggle initialTheme={initialTheme} />
          <span className="bg-border mx-1 hidden h-6 w-px sm:block" aria-hidden="true" />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              {/* Signing in is the primary action on a phone, where there is
                  room for one button and a returning officer is the likelier
                  visitor; on a wider screen it steps back and registration
                  takes the emphasis. Registering stays one tap away either way,
                  from the sheet. Two labels for one destination would give
                  assistive technology two links to the same place. */}
              <Link
                href="/login"
                className={cn(
                  'focus-visible:ring-ring/50 inline-flex min-h-11 items-center justify-center',
                  'rounded-xl px-3 text-sm font-medium transition-colors outline-none sm:px-4',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'sm:text-foreground sm:hover:bg-muted sm:bg-transparent',
                  'focus-visible:ring-4 active:translate-y-px',
                )}
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/register"
                className={cn(buttonVariants(), 'hidden min-h-11 rounded-xl px-5 sm:inline-flex')}
              >
                สร้างบัญชีผู้ใช้
              </Link>
            </>
          )}
        </div>
      </div>
    </HeaderShell>
  );
}
