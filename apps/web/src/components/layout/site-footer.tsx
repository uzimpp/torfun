import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { ThemeToggle } from '@/components/auth/theme-toggle';
import { landingSections } from './nav-config';

/**
 * The site footer, on every page in the chrome group.
 *
 * Links, the notice, the light/dark control. No wordmark and no restatement of
 * what the product is: the header carries the brand on the same screen, and a
 * second oversized one at the bottom was the loudest thing on a page whose
 * whole job is to be quiet.
 *
 * The notice is the part that is not optional. Everything here is a shortcut to
 * the original announcement, and the summary an officer reads is not the
 * document they bid against — so it follows them onto every page rather than
 * living only where the marketing copy happens to mention it.
 *
 * Every page fills the window before this begins, so it is reached by scrolling
 * rather than met on arrival.
 */
export function SiteFooter({
  signedIn = false,
  initialTheme = 'light',
}: {
  signedIn?: boolean;
  initialTheme?: 'light' | 'dark';
}) {
  // Thai calendar year, which is what every date on an announcement uses.
  const year = new Date().getFullYear() + 543;

  return (
    <footer className="bg-card mt-auto border-t">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
        <div className="grid gap-8 sm:grid-cols-3 lg:gap-12">
          <FooterColumn title="หน้าแรก">
            {landingSections.map(({ href, label }) => (
              <li key={href}>
                <FooterSectionLink hash={href}>{label}</FooterSectionLink>
              </li>
            ))}
          </FooterColumn>

          {/* Offering an officer who is already signed in a way to register
              again is noise, and on the landing page it is a second "create an
              account" link competing with the one that matters. */}
          <FooterColumn title={signedIn ? 'พื้นที่ทำงาน' : 'เริ่มใช้งาน'}>
            <li>
              <FooterLink href="/search">ค้นหาประกาศ</FooterLink>
            </li>
            {signedIn ? (
              <li>
                <FooterLink href="/dashboard">แดชบอร์ด</FooterLink>
              </li>
            ) : (
              <>
                <li>
                  <FooterLink href="/login">เข้าสู่ระบบ</FooterLink>
                </li>
                <li>
                  <FooterLink href="/register">สร้างบัญชีผู้ใช้</FooterLink>
                </li>
              </>
            )}
          </FooterColumn>

          <div>
            <h2 className="text-foreground text-xs font-semibold tracking-wider uppercase">
              การแสดงผล
            </h2>
            <div className="mt-3">
              <ThemeToggle initialTheme={initialTheme} withLabel />
            </div>
          </div>
        </div>

        <p className="text-muted-foreground mt-10 flex gap-3 border-t pt-6 text-xs">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="max-w-3xl">
            ผลสรุปจาก AI เป็นข้อมูลช่วยอ่าน ไม่ใช่การยืนยันข้อเท็จจริง โปรดตรวจสอบเอกสาร TOR
            ต้นฉบับและเงื่อนไขของหน่วยงานเจ้าของประกาศทุกครั้งก่อนยื่นข้อเสนอ
          </span>
        </p>

        <div className="text-muted-foreground mt-5 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span data-numeric>&copy; {year}</span> Torfun · งานซอฟต์แวร์ · e-bidding ·
            หน่วยงานภาครัฐ
          </p>
          <p>ข้อมูลประกาศจากระบบจัดซื้อจัดจ้างภาครัฐ (e-GP)</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-foreground text-xs font-semibold tracking-wider uppercase">{title}</h2>
      <ul className="mt-3 space-y-1">{children}</ul>
    </div>
  );
}

const footerLinkClass =
  'text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex min-h-10 items-center rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4';

/**
 * A section link, written as a plain anchor with the landing page's path in
 * front of the fragment. The footer also appears on pages that have no such
 * section, and a bare `#value` there would be a link that does nothing.
 */
function FooterSectionLink({ hash, children }: { hash: string; children: ReactNode }) {
  return (
    <a href={`/${hash}`} className={footerLinkClass}>
      {children}
    </a>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: '/login' | '/register' | '/search' | '/dashboard';
  children: ReactNode;
}) {
  return (
    <Link href={href} className={footerLinkClass}>
      {children}
    </Link>
  );
}
