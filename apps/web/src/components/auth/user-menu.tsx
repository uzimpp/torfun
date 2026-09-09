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
 * The shape of every row in the panel, logout included. One inset and one gap
 * for all of them is what keeps the icons in one column and the labels in
 * another; a row without an icon puts its text where the icons are, which is
 * what made this menu look ragged.
 */
const ROW = 'min-h-11 gap-3 rounded-lg px-3';

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

      {/* One inset for everything inside: `p-2` on the popup, `px-3` on every
          row, and a separator with no negative margin of its own. Left to the
          defaults, rows sat 6px in while the separator sat 4px out, so nothing
          in the panel lined up with anything else. */}
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[90vw] p-2">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2">
            <span className="text-foreground block text-sm break-all">{user.username}</span>
            <span>{role === 'Admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่พัฒนาธุรกิจ'}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="mx-0 my-2" />

        <DropdownMenuGroup className="space-y-0.5">
          <DropdownMenuItem className={ROW} render={<Link href="/dashboard" />}>
            <LayoutDashboard aria-hidden="true" className="size-4" />
            แดชบอร์ด
          </DropdownMenuItem>
          <DropdownMenuItem className={ROW} render={<Link href="/company" />}>
            <Building2 aria-hidden="true" className="size-4" />
            บริษัทและผลงาน
          </DropdownMenuItem>
          {/* Listed and visibly not ready, rather than hidden: an officer who is
              told the page is coming stops hunting for it. */}
          <DropdownMenuItem disabled className={ROW}>
            <Bookmark aria-hidden="true" className="size-4" />
            TOR ของฉัน
            <span className="text-muted-foreground ms-auto text-xs">เร็ว ๆ นี้</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="mx-0 my-2" />

        <LogoutButton menuItem className={ROW} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
