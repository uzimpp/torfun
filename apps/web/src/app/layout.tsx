import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TOR Finder',
  description: 'ระบบค้นหาและคัดกรองประกาศจัดซื้อจัดจ้างซอฟต์แวร์ในกรุงเทพมหานคร',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
