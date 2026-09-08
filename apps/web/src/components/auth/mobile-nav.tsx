'use client';

import { useState, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import type { UserRole } from '@torfun/types';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { NavLinks } from './nav-links';

export function MobileNav({ role, children }: { role?: UserRole; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" className="size-11 md:hidden" aria-label="เปิดเมนู" />}
      >
        <Menu aria-hidden="true" />
      </SheetTrigger>
      <SheetContent showCloseButton={false} className="w-[min(90vw,24rem)]">
        <SheetHeader>
          <SheetTitle>เมนู Torfun</SheetTitle>
          <SheetDescription>ค้นหาหน้าที่ต้องการใช้งาน</SheetDescription>
        </SheetHeader>
        <SheetClose
          render={
            <Button
              variant="ghost"
              className="absolute top-2 right-2 size-11"
              aria-label="ปิดเมนู"
            />
          }
        >
          <X aria-hidden="true" />
        </SheetClose>
        <nav aria-label="เมนูมือถือ" className="px-4">
          <NavLinks role={role} onNavigate={() => setOpen(false)} />
        </nav>
        {children && <div className="mt-auto space-y-4 border-t p-4">{children}</div>}
      </SheetContent>
    </Sheet>
  );
}
