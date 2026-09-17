import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Anuphan, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const anuphan = Anuphan({
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-anuphan',
});

/**
 * Numerals, budgets, dates, announcement ids and status codes.
 *
 * Anuphan carries the prose; a mono face carries anything a person reads as a
 * value rather than a sentence, so a column of figures lines up and an
 * announcement id cannot be mistaken for a word.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'TOR Finder',
  description: 'ระบบค้นหาและคัดกรองประกาศจัดซื้อจัดจ้างซอฟต์แวร์ของหน่วยงานภาครัฐ',
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
    <html
      lang="th"
      className={`${anuphan.variable} ${plexMono.variable} h-full antialiased ${theme}`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
