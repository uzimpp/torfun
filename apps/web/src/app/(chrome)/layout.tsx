import { cookies } from 'next/headers';
import { WorkspaceSidebar } from '@/components/layout/workspace-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { getCurrentUser } from '@/lib/auth';

/**
 * Everything a person navigates around: the landing page, search, the
 * dashboard, the ingestion console.
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
      <SiteHeader
        initialTheme={theme}
        user={user ? { username: user.username, role: user.role } : null}
      />
      <div className="flex flex-1">
        {user && <WorkspaceSidebar role={user.role} />}
        <div id="page-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </>
  );
}
