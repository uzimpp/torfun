import type { Metadata } from 'next';
import './globals.css';
import { AppSidebar } from '@/components/auth/app-sidebar';
import { Navbar } from '@/components/auth/navbar';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'TOR Finder',
  description: 'ระบบค้นหาและคัดกรองประกาศจัดซื้อจัดจ้างซอฟต์แวร์ในกรุงเทพมหานคร',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const user = await getCurrentUser();
  return (
    <html lang="th" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#page-content"
          className="focus:bg-background sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4"
        >
          ข้ามไปยังเนื้อหา
        </a>
        <Navbar user={user ? { username: user.username, role: user.role } : null} />
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
