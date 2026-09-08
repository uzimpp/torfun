'use client';
import { ChevronDown, UserRound } from 'lucide-react';
import type { CurrentUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LogoutButton } from './logout-button';
export function UserMenu({ user }: { user: Pick<CurrentUser, 'username' | 'role'> }) {
  const role = user.role === 'admin' ? 'Admin' : 'BD';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="bg-card h-auto min-h-12 gap-3 rounded-xl border px-3 py-2"
            aria-label={`บัญชี ${user.username} · ${role}`}
          />
        }
      >
        <span className="bg-secondary text-primary flex size-8 items-center justify-center rounded-lg">
          <UserRound aria-hidden="true" />
        </span>
        <span className="min-w-0 text-left">
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
        <LogoutButton menuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
