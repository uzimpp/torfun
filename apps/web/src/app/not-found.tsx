import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowUpRight } from 'lucide-react';

import { getCurrentUser } from '@/lib/auth';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { TorSearchField } from '@/components/search/tor-search-field';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'ไม่พบหน้าที่ต้องการ | Torfun' };

/**
 * The 404, wearing the same header and footer as everywhere else.
 *
 * It sits outside the `(chrome)` group — Next renders `not-found` in the root
 * layout — so it composes both itself rather than inheriting them. A person who
 * mistypes a URL should still be somewhere recognisable, with a way onward.
 *
 * The way onward is a search field. Most wrong URLs here are a stale or
 * mistyped link to an announcement, and searching for it is a better answer
 * than a button back to the home page that makes them start over.
 */
export default async function NotFound() {
  const user = await getCurrentUser();
  const theme = (await cookies()).get('torfun-theme')?.value === 'dark' ? 'dark' : 'light';

  return (
    <>
      <SiteHeader
        user={user ? { username: user.username, role: user.role } : null}
        withSearch={false}
      />

      <main className="landing-grid page-fill flex flex-1 flex-col justify-center px-4 py-16 [--header-h:calc(4rem_+_1px)] sm:px-6 lg:px-10 lg:[--header-h:calc(4.5rem_+_1px)]">
        <div className="mx-auto w-full max-w-2xl">
          <p
            data-numeric
            className="text-primary/25 font-mono text-7xl leading-none font-medium tracking-tighter select-none sm:text-8xl"
          >
            404
          </p>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            ไม่พบหน้าที่ต้องการ
          </h1>
          <p className="text-muted-foreground mt-4 max-w-lg">
            ลิงก์อาจถูกย้าย ถูกลบ หรือพิมพ์ที่อยู่ไม่ครบ หากกำลังตามหาประกาศสักฉบับ
            ลองค้นจากชื่อโครงการหรือชื่อหน่วยงานได้เลย
          </p>

          <div className="mt-8 max-w-xl">
            <TorSearchField size="hero" label="ค้นหาประกาศ TOR" />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={user ? '/dashboard' : '/'}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-12 rounded-xl px-5')}
            >
              {user ? 'ไปที่แดชบอร์ด' : 'กลับหน้าแรก'}
              <ArrowUpRight aria-hidden="true" />
            </Link>
            {user && (
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground py-3 text-sm underline-offset-4 transition-colors hover:underline"
              >
                กลับหน้าแรก
              </Link>
            )}
          </div>
        </div>
      </main>

      <SiteFooter signedIn={user !== null} initialTheme={theme} />
    </>
  );
}
