import Link from 'next/link';
import { Bell, Languages, Moon, ScanLine } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MobileNav } from './mobile-nav';
import { UserMenu } from './user-menu';
export function Navbar({ user }: { user: Pick<CurrentUser, 'username' | 'role'> | null }) {
  return (
    <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex items-center gap-2">
          {user && <MobileNav role={user.role} />}
          <Link
            href={user ? '/dashboard' : '/'}
            aria-label="Torfun"
            className="text-primary flex items-center gap-2 text-2xl font-semibold tracking-tight focus-visible:outline-2"
          >
            <ScanLine className="size-7" aria-hidden="true" />
            Torfun<span className="sr-only">{user ? ' แดชบอร์ด' : ' หน้าแรก'}</span>
          </Link>
        </div>
        <div
          className={cn('flex items-center justify-end gap-1 sm:gap-2', user && 'w-full sm:w-auto')}
        >
          {user && (
            <Button
              disabled
              variant="ghost"
              className="size-10"
              title="การแจ้งเตือน — เร็ว ๆ นี้"
              aria-label="การแจ้งเตือน — เร็ว ๆ นี้"
            >
              <Bell aria-hidden="true" />
            </Button>
          )}
          <Button
            disabled
            variant="ghost"
            className="size-10"
            title="สลับโหมดกลางวัน / กลางคืน — เร็ว ๆ นี้"
            aria-label="สลับโหมดกลางวัน / กลางคืน — เร็ว ๆ นี้"
          >
            <Moon aria-hidden="true" />
          </Button>
          <Button
            disabled
            variant="ghost"
            className="size-10"
            title="เปลี่ยนภาษา TH / EN — เร็ว ๆ นี้"
            aria-label="เปลี่ยนภาษา TH / EN — เร็ว ๆ นี้"
          >
            <Languages aria-hidden="true" />
          </Button>
          <span className="bg-border mx-1 h-6 w-px" aria-hidden="true" />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link href="/login" className={cn(buttonVariants(), 'min-h-11 px-3 sm:px-5')}>
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
