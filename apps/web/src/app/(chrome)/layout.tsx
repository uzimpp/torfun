import { cookies } from 'next/headers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCurrentUser } from '@/lib/auth';

/**
 * Everything a person navigates around: the landing page, search, the
 * dashboard, the ingestion console.
 *
 * There is no rail beside the content. Every destination lives in the header,
 * which means one list of them rather than two to keep in step, and a page gets
 * the full width on every screen instead of only on a phone.
 *
 * The sign-in, registration and company pages sit outside this group and get no
 * navigation at all — see the root layout for why.
 */
export default async function ChromeLayout({ children }: LayoutProps<'/'>) {
  const user = await getCurrentUser();
  const theme = (await cookies()).get('torfun-theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <>
      <a
        href="#page-content"
        className="focus:bg-card focus:ring-ring/40 sr-only rounded-xl focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:p-4 focus:ring-4"
      >
        ข้ามไปยังเนื้อหา
      </a>
      <SiteHeader user={user ? { username: user.username, role: user.role } : null} />
      {/* The header is sticky, so it takes this much off the top of the window
          for good. `page-fill` subtracts it, which is what lets a page end
          exactly at the fold instead of a hair below it. */}
      <div
        id="page-content"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col [--header-h:calc(4rem_+_1px)] lg:[--header-h:calc(4.5rem_+_1px)]"
      >
        {children}
      </div>
      <SiteFooter signedIn={user !== null} initialTheme={theme} />
    </>
  );
}
