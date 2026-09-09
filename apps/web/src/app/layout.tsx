import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Anuphan } from 'next/font/google';
import './globals.css';

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-anuphan',
});

export const metadata: Metadata = {
  title: 'TOR Finder',
  description: 'ระบบค้นหาและคัดกรองประกาศจัดซื้อจัดจ้างซอฟต์แวร์ในกรุงเทพมหานคร',
};

/**
 * The document shell, and nothing else.
 *
 * Navigation lives in `(chrome)/layout.tsx` rather than here, because the pages
 * outside that group are not places to navigate from: signing in, registering
 * and recording a company are steps in one flow, and a sidebar offering to leave
 * mid-way is an invitation to abandon it.
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = (await cookies()).get('torfun-theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang="th" className={`${anuphan.variable} h-full antialiased ${theme}`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
