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

        <div className="flex min-w-0 flex-1 justify-center">
          <HeaderSearch enabled={withSearch} />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled
            aria-label="การแจ้งเตือนยังไม่พร้อมใช้งาน"
            className="hidden size-10 rounded-full border-border/60 bg-background/80 shadow-none disabled:opacity-100 sm:inline-flex"
          >
            <Bell aria-hidden="true" />
          </Button>
          <ThemeToggle
            initialTheme={initialTheme}
            className="size-10 rounded-full border-border/60 bg-background/80 shadow-none"
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
