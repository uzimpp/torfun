import Link from 'next/link';

import type { CurrentUser } from '@/lib/auth';
import { buttonVariants } from '@/components/ui/button';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/auth/theme-toggle';
import { UserMenu } from '@/components/auth/user-menu';
import { cn } from '@/lib/utils';
import { Brand } from './brand';
import { HeaderShell } from './header-shell';
import { HeaderSearch } from './header-search';
import { MobileMenu } from './mobile-menu';

/**
 * One header for the whole site, and — with the sidebar gone — the only
 * navigation there is.
 *
 * The brand always points home. It used to send a signed-in officer to their
 * dashboard, which quietly took away the way back to the page describing the
 * product; the dashboard is reachable from the account menu instead.
 *
 * The search field is centered in the space between the brand and account
 * controls; the theme switch remains beside the account menu.
 */
export function SiteHeader({
  user,
  withSearch = true,
  initialTheme = 'light',
}: {
  user: Pick<CurrentUser, 'username' | 'role'> | null;
  /** The 404 sets this false: it is reached at every URL, and carries its own field. */
  withSearch?: boolean;
  initialTheme?: 'light' | 'dark';
}) {
  return (
    <HeaderShell>
      {/* Padding and gaps tighten below `sm` because the narrowest phone this
          has to serve is 320px, and at that width the brand, the menu button
          and the sign-in action together leave nothing spare. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:h-18 lg:px-10">
        <MobileMenu role={user?.role} withSearch={withSearch} />
        <Brand href="/" className="shrink-0" />

        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          <HeaderSearch enabled={withSearch} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          {user?.role === 'business_development_officer' && <NotificationBell />}
          <ThemeToggle
            initialTheme={initialTheme}
            className="border-border/60 bg-background/80 size-10 rounded-full shadow-none"
          />
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
