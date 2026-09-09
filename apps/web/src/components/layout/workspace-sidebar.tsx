'use client';

import { usePathname } from 'next/navigation';
import type { UserRole } from '@torfun/types';

import { WorkspaceNav } from './workspace-nav';

/** Pages that are about the product rather than the work, and get no rail. */
const MARKETING_ROUTES = new Set(['/', '/search']);

/**
 * The workspace rail, on screens wide enough to spare the column.
 *
 * It withdraws on the landing page and on search: both are full-width reading
 * surfaces that a signed-in officer reaches deliberately, and a workspace menu
 * alongside them only narrows the thing they came to read.
 */
export function WorkspaceSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  if (MARKETING_ROUTES.has(pathname)) return null;

  return (
    <aside className="bg-sidebar hidden w-64 shrink-0 border-e p-4 md:block">
      <div className="sticky top-24">
        <p className="text-muted-foreground mb-3 px-3 text-xs font-medium tracking-wider uppercase">
          พื้นที่ทำงาน
        </p>
        <nav aria-label="เมนูพื้นที่ทำงาน">
          <WorkspaceNav role={role} />
        </nav>
        <p className="text-muted-foreground mt-10 border-t px-3 pt-5 text-xs">
          ตรวจสอบเอกสารต้นฉบับ
          <br />
          ก่อนตัดสินใจยื่นข้อเสนอทุกครั้ง
        </p>
      </div>
    </aside>
  );
}
