import { Bookmark, Database, LayoutDashboard, Search, type LucideIcon } from 'lucide-react';
import type { UserRole } from '@torfun/types';

/**
 * One list of destinations, read by the sidebar, the header and the mobile
 * sheet alike. They drifted apart while each kept its own copy — the sidebar
 * offered a route the sheet did not — and a person navigating on a phone
 * should not be shown a smaller product than one on a laptop.
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

/** Sections of the landing page. Same-page anchors, so plain hrefs. */
export const landingSections = [
  { href: '#value', label: 'สิ่งที่ระบบช่วย' },
  { href: '#workflow', label: 'ขั้นตอนการทำงาน' },
  { href: '#limits', label: 'ขอบเขตและข้อจำกัด' },
] as const;

/** Example queries offered under the landing page's search field. */
export const exampleQueries = ['ระบบสารสนเทศ', 'พัฒนาเว็บไซต์', 'จัดหาซอฟต์แวร์'] as const;
