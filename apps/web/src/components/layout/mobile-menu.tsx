'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { UserRole } from '@torfun/types';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { TorSearchField } from '@/components/search/tor-search-field';
import { cn } from '@/lib/utils';
import { useHeaderSearchVisible } from './header-search';
import { MarketingNav } from './marketing-nav';
import { WorkspaceNav } from './workspace-nav';

/**
 * Everything the header cannot fit on a narrow screen, in one sheet.
 *
 * A guest gets the landing page's sections and both ways in; an officer gets
 * their workspace and the search field the header drops below `md`. It renders
 * for both, because a header whose only mobile control is a login button leaves
 * a signed-in officer with no navigation at all.
 */
export function MobileMenu({ role }: { role?: UserRole }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const searchInHeader = useHeaderSearchVisible();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" className="size-11 rounded-xl md:hidden" aria-label="เปิดเมนู" />
        }
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>

      <SheetContent showCloseButton={false} className="flex w-[min(92vw,22rem)] flex-col">
        <SheetHeader className="pe-14">
          <SheetTitle>เมนู</SheetTitle>
          <SheetDescription>
            {role ? 'ไปยังส่วนที่ต้องการในพื้นที่ทำงาน' : 'ดูรายละเอียดระบบ หรือเข้าสู่ระบบ'}
          </SheetDescription>
        </SheetHeader>

        <SheetClose
          render={
            <Button
              variant="ghost"
              className="absolute end-3 top-3 size-11 rounded-xl"
              aria-label="ปิดเมนู"
            />
          }
        >
          <X aria-hidden="true" className="size-5" />
        </SheetClose>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {searchInHeader && (
            <TorSearchField size="compact" label="ค้นหาประกาศ TOR" className="mb-6" />
          )}

          {role ? (
            <nav aria-label="เมนูพื้นที่ทำงาน">
              <WorkspaceNav role={role} onNavigate={close} showHints />
            </nav>
          ) : (
            <>
              {/* Off the landing page there are no sections to jump to, so the
                  way back to it is the one thing this has to offer. */}
              <Link
                href="/"
                onClick={close}
                className="text-muted-foreground hover:text-foreground flex min-h-12 items-center rounded-xl px-3 text-base transition-colors"
              >
                ทำความรู้จัก Torfun
              </Link>
              <MarketingNav
                onNavigate={close}
                className="flex flex-col items-stretch gap-1 [&>a]:min-h-12 [&>a]:px-3 [&>a]:text-base"
              />
            </>
          )}
        </div>

        {!role && (
          <div className="mt-auto grid gap-3 border-t p-4">
            <Link
              href="/register"
              onClick={close}
              className={cn(buttonVariants(), 'min-h-12 rounded-xl text-base')}
            >
              สร้างบัญชีผู้ใช้
            </Link>
            <Link
              href="/login"
              onClick={close}
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'min-h-12 rounded-xl text-base',
              )}
            >
              เข้าสู่ระบบ
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
