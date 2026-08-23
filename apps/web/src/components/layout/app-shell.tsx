'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Bookmark, Globe2, Grid2X2, Home, Search, SunMoon, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/', label: 'หน้าหลัก', icon: Home },
  { href: '/dashboard', label: 'แดชบอร์ด', icon: Grid2X2 },
  { href: '/search', label: 'ค้นหา', icon: Search },
  { href: '/my-tors', label: 'TOR ของฉัน', icon: Bookmark },
  { href: '/profile', label: 'โปรไฟล์', icon: UserRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-[100dvh] bg-[#f6f7fb] text-[#1f293d]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dfe3ec] bg-[#fbfcff]/95 px-4 backdrop-blur md:px-7">
        <Link href="/" className="flex items-center gap-3 font-medium text-[#111827]">
          <span className="grid size-11 place-items-center rounded-xl bg-[#1f2942] text-xl font-medium text-white">
            T
          </span>
          <span className="text-lg tracking-[-0.02em]">TORFUN</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            type="button"
            aria-disabled="true"
            title="Thai and English language switching will be available soon"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce2eb] px-2.5 text-xs font-semibold text-[#526076] transition hover:bg-[#edf1f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] aria-disabled:cursor-not-allowed"
          >
            <Globe2 className="size-4" strokeWidth={1.8} />
            <span>TH</span>
            <span className="text-[#a1aaba]">/</span>
            <span className="text-[#9aa5b5]">EN</span>
          </button>
          <button
            type="button"
            aria-disabled="true"
            title="Light and dark theme switching will be available soon"
            className="grid size-9 place-items-center rounded-lg border border-[#dce2eb] text-[#526076] transition hover:bg-[#edf1f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] aria-disabled:cursor-not-allowed"
          >
            <SunMoon className="size-4" strokeWidth={1.8} />
            <span className="sr-only">สลับธีมเร็ว ๆ นี้</span>
          </button>
          <Link
            href="/notifications"
            aria-label="การแจ้งเตือน"
            className="relative grid size-10 place-items-center rounded-lg text-[#4a5870] transition hover:bg-[#edf1f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] active:translate-y-px"
          >
            <Bell className="size-5" strokeWidth={1.8} />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[#df7a35]" />
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[#edf1f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8]"
          >
            <span className="grid size-8 place-items-center rounded-full bg-[#202b45] text-white">
              <UserRound className="size-4" />
            </span>
            <span className="hidden text-sm font-medium sm:block">บริษัท เอเอเอ จำกัด</span>
          </Link>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-[72px] hidden h-[calc(100dvh-72px)] w-[92px] shrink-0 border-r border-[#e0e4ec] bg-[#fbfcff] py-5 md:block">
          <nav aria-label="เมนูหลัก" className="flex flex-col items-center gap-2">
            {navigation.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    'grid size-12 place-items-center rounded-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3974d8] active:translate-y-px',
                    active
                      ? 'bg-[#202b45] text-white shadow-[0_5px_12px_rgba(31,41,66,0.18)]'
                      : 'text-[#46536a] hover:bg-[#edf1f8]',
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-7 pb-24 sm:px-7 lg:px-9">{children}</main>
      </div>
      <nav
        aria-label="เมนูหลักบนมือถือ"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[68px] items-center justify-around border-t border-[#dfe3ec] bg-[#fbfcff]/95 px-2 backdrop-blur md:hidden"
      >
        {navigation.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                'grid size-11 place-items-center rounded-xl transition active:translate-y-px',
                active ? 'bg-[#202b45] text-white' : 'text-[#526076]',
              )}
            >
              <Icon className="size-5" strokeWidth={1.8} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
