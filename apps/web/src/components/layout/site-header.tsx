import Link from 'next/link';
import { Bell } from 'lucide-react';

import type { CurrentUser } from '@/lib/auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { UserMenu } from '@/components/auth/user-menu';
import { cn } from '@/lib/utils';
import { Brand } from './brand';
import { HeaderShell } from './header-shell';
import { HeaderSearch } from './header-search';
import { PrimaryNav } from './primary-nav';
import { MobileMenu } from './mobile-menu';

/**
 * One header for the whole site, and — with the sidebar gone — the only
 * navigation there is.
 *
 * The brand always points home. It used to send a signed-in officer to their
 * dashboard, which quietly took away the way back to the page describing the
 * product; the dashboard has its own entry in the nav beside it.
 *
 * The light/dark control is not here. It is a setting, chosen once and rarely
 * changed, and it was taking a permanent slot in the row a person uses on every
 * visit; it now lives in the footer, alongside the rest of the site's plumbing.
 */
export function SiteHeader({
  user,
  withSearch = true,
}: {
  user: Pick<CurrentUser, 'username' | 'role'> | null;
  /** The 404 sets this false: it is reached at every URL, and carries its own field. */
  withSearch?: boolean;
}) {
  return (
    <HeaderShell>
      {/* Padding and gaps tighten below `sm` because the narrowest phone this
          has to serve is 320px, and at that width the brand, the menu button
          and the sign-in action together leave nothing spare. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:h-18 lg:px-10">
        <MobileMenu role={user?.role} withSearch={withSearch} />
        <Brand href="/" className="shrink-0" />
        <PrimaryNav role={user?.role} />

        <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
          <HeaderSearch enabled={withSearch} />
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
