import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Anuphan } from 'next/font/google';
import './globals.css';
import { AppSidebar } from '@/components/auth/app-sidebar';
import { Navbar } from '@/components/auth/navbar';
import { getCurrentUser } from '@/lib/auth';

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-anuphan',
});

export const metadata: Metadata = {
  title: 'TOR Finder',
  description: 'ระบบค้นหาและคัดกรองประกาศจัดซื้อจัดจ้างซอฟต์แวร์ในกรุงเทพมหานคร',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const user = await getCurrentUser();
  const theme = (await cookies()).get('torfun-theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang="th" className={`${anuphan.variable} h-full antialiased ${theme}`}>
      <body className="flex min-h-full flex-col font-sans">
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
      </body>
    </html>
  );
}
