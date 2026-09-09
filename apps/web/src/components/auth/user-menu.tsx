'use client';

import Link from 'next/link';
import { Bookmark, Building2, ChevronDown, LayoutDashboard, UserRound } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LogoutButton } from './logout-button';

/**
 * The account menu, and the way to everything that belongs to the person
 * rather than to the announcements: their workspace, the company record their
 * matches are scored against, and the way out.
 *
 * The company record is here rather than in the main navigation because it is
 * written once and revisited rarely — it belongs with the account, not beside
 * the pages an officer works in daily.
 */
export function UserMenu({ user }: { user: Pick<CurrentUser, 'username' | 'role'> }) {
  const role = user.role === 'admin' ? 'Admin' : 'BD';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="bg-card h-auto min-h-12 gap-3 rounded-xl border px-2 py-2 sm:px-3"
            aria-label={`บัญชี ${user.username} · ${role}`}
          />
        }
      >
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
          <UserRound aria-hidden="true" />
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-32 truncate text-sm font-semibold">{user.username}</span>
          <span className="text-muted-foreground block text-xs">{role}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 max-w-[90vw] p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-3">
            <span className="text-foreground block text-sm break-all">{user.username}</span>
            <span>{role === 'Admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่พัฒนาธุรกิจ'}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem className="min-h-11" render={<Link href="/dashboard" />}>
            <LayoutDashboard aria-hidden="true" className="size-4" />
            แดชบอร์ด
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" render={<Link href="/company-experiences" />}>
            <Building2 aria-hidden="true" className="size-4" />
            บริษัทและผลงาน
          </DropdownMenuItem>
          {/* Listed and visibly not ready, rather than hidden: an officer who is
              told the page is coming stops hunting for it. */}
          <DropdownMenuItem disabled className="min-h-11">
            <Bookmark aria-hidden="true" className="size-4" />
            TOR ของฉัน
            <span className="text-muted-foreground ms-auto text-xs">เร็ว ๆ นี้</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <LogoutButton menuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
