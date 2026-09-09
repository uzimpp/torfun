'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Search, Bookmark, Database } from 'lucide-react';
import type { UserRole } from '@torfun/types';
import { cn } from '@/lib/utils';
export function NavLinks({ role, onNavigate }: { role?: UserRole; onNavigate?: () => void }) {
  const pathname = usePathname();
  if (!role) return null;
  const links = [
    { href: '/dashboard', label: 'แดชบอร์ด', Icon: LayoutDashboard },
    ...(role === 'admin'
      ? [{ href: '/admin/ingestion', label: 'การดึงข้อมูล TOR', Icon: Database }]
      : []),
  ];
  return (
    <div className="flex flex-col gap-2">
      {links.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={pathname === href ? 'page' : undefined}
          className={cn(
            'hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-ring flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-2',
            pathname === href
              ? 'bg-secondary text-secondary-foreground font-semibold'
              : 'text-muted-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
      {[
        { label: 'ค้นหา TOR', Icon: Search },
        { label: 'TOR ของฉัน', Icon: Bookmark },
      ].map(({ label, Icon }) => (
        <div
          key={label}
          aria-disabled="true"
          className="text-muted-foreground flex min-h-12 items-center gap-3 px-3 text-sm"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {label}
            <span className="mt-0.5 block text-xs">เร็ว ๆ นี้</span>
          </span>
        </div>
      ))}
    </div>
  );
}
