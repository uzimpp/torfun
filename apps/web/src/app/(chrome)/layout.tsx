import { cookies } from 'next/headers';
import { AppSidebar } from '@/components/auth/app-sidebar';
import { Navbar } from '@/components/auth/navbar';
import { getCurrentUser } from '@/lib/auth';

/**
 * Everything a person navigates around: the landing page, the dashboard, the
 * ingestion console.
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
        className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4"
      >
        ข้ามไปยังเนื้อหา
      </a>
      <Navbar
        initialTheme={theme}
        user={user ? { username: user.username, role: user.role } : null}
      />
      <div className="flex flex-1">
        {user && <AppSidebar role={user.role} />}
        <div id="page-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
    </>
  );
}
