import {
  Bookmark,
  Building2,
  Database,
  LayoutDashboard,
  ScrollText,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import type { UserRole } from '@torfun/types';

/**
 * One list of destinations, read by the header and by the mobile sheet alike.
 * They drifted apart while each kept its own copy — one offered a route the
 * other did not — and a person navigating on a phone should not be shown a
 * smaller product than one on a laptop.
 */
export interface NavItem {
  href: '/dashboard' | '/search' | '/admin/ingestion';
  label: string;
  Icon: LucideIcon;
  /** What this destination is for, shown where there is room to say it. */
  hint: string;
}

export function workspaceNav(role: UserRole): NavItem[] {
  return [
    {
      href: '/dashboard',
      label: 'แดชบอร์ด',
      Icon: LayoutDashboard,
      hint: 'ภาพรวมของทีม',
    },
    {
      href: '/search',
      label: 'ค้นหา TOR',
      Icon: Search,
      hint: 'ค้นประกาศจากคลังข้อมูล',
    },
    ...(role === 'admin'
      ? [
          {
            href: '/admin/ingestion' as const,
            label: 'การดึงข้อมูล TOR',
            Icon: Database,
            hint: 'สถานะและบันทึกข้อผิดพลาด',
          },
        ]
      : []),
  ];
}

/**
 * Destinations that exist in the product's plan but not yet in the router.
 * They are listed, and visibly not clickable, rather than hidden: an officer
 * who is told the feature is coming stops looking for it.
 */
export const plannedNav: { label: string; Icon: LucideIcon }[] = [
  { label: 'TOR ของฉัน', Icon: Bookmark },
];

/**
 * The account menu's rows — everything that belongs to the person rather than
 * to the announcements. Kept here, beside `workspaceNav`, so the header and the
 * dropdown read from one list rather than drifting apart the way the mobile and
 * desktop navs once did.
 *
 * The two roles get different menus because they own different things: a
 * Business Development Officer has a Company and saved TORs; a Site
 * Administrator has the ingestion console and the other accounts, and no
 * Company at all (ADR-0011).
 */
export interface AccountNavItem {
  href: Route;
  /** A same-page anchor on `href`, for the failure log inside the console. */
  hash?: string;
  label: string;
  Icon: LucideIcon;
}

export function accountNav(role: UserRole): AccountNavItem[] {
  if (role === 'admin') {
    return [
      { href: '/dashboard', label: 'แดชบอร์ด', Icon: LayoutDashboard },
      { href: '/admin/ingestion', label: 'การดึงข้อมูล TOR', Icon: Database },
      {
        href: '/admin/ingestion',
        hash: 'failures',
        label: 'บันทึกข้อผิดพลาด',
        Icon: ScrollText,
      },
      { href: '/admin/accounts', label: 'จัดการบัญชีผู้ใช้', Icon: Users },
    ];
  }

  return [
    { href: '/dashboard', label: 'แดชบอร์ด', Icon: LayoutDashboard },
    { href: '/company', label: 'บริษัทและผลงาน', Icon: Building2 },
  ];
}

/** Sections of the landing page. Same-page anchors, so plain hrefs. */
export const landingSections = [
  { href: '#value', label: 'สิ่งที่ระบบช่วย' },
  { href: '#workflow', label: 'ขั้นตอนการทำงาน' },
  { href: '#limits', label: 'ขอบเขตและข้อจำกัด' },
] as const;

/** Example queries offered under the landing page's search field. */
export const exampleQueries = ['ระบบสารสนเทศ', 'พัฒนาเว็บไซต์', 'จัดหาซอฟต์แวร์'] as const;
