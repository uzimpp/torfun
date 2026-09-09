import type { UserRole } from '@torfun/types';
import { NavLinks } from './nav-links';
export function AppSidebar({ role }: { role: UserRole }) {
  return (
    <aside className="bg-card hidden w-60 shrink-0 border-r p-5 md:block">
      <div className="sticky top-28">
        <p className="text-muted-foreground mb-5 px-3 text-xs font-medium">พื้นที่ทำงานของคุณ</p>
        <nav aria-label="เมนูพื้นที่ทำงาน">
          <NavLinks role={role} />
        </nav>
        <p className="text-muted-foreground mt-12 border-t px-3 pt-5 text-xs leading-relaxed">
          ตรวจสอบเอกสารต้นฉบับ
          <br />
          ก่อนตัดสินใจยื่นข้อเสนอทุกครั้ง
        </p>
      </div>
    </aside>
  );
}
