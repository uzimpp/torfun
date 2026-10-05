'use client';

import { ShieldCheck, UserRound } from 'lucide-react';
import type { AdminUserResponse } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useAccountsData } from './use-accounts-data';

/**
 * Site Administrator view of every account (USR-10).
 *
 * A worktable, not a dashboard: the administrator scans who can do what, and
 * acts rarely. The two guardrails the API enforces are shown before they are
 * hit — the administrator's own row cannot be edited, and the last active
 * administrator cannot be demoted or deactivated — so a refused click is the
 * exception, not the way the screen teaches its rules.
 */

const ACTION = 'h-8 rounded-lg px-2.5 text-xs';

function RoleBadge({ role }: { role: AdminUserResponse['role'] }) {
  return role === 'admin' ? (
    <Badge className="gap-1">
      <ShieldCheck aria-hidden="true" />
      ผู้ดูแลระบบ
    </Badge>
  ) : (
    <Badge variant="outline">เจ้าหน้าที่พัฒนาธุรกิจ</Badge>
  );
}

export function AccountsConsole({ currentUserId }: { currentUserId: string }) {
  const { accounts, loading, error, pendingId, actionError, updateAccount } = useAccountsData();

  const activeAdmins = accounts.filter(
    (account) => account.role === 'admin' && account.is_active,
  ).length;
  const officers = accounts.length - accounts.filter((a) => a.role === 'admin').length;

  return (
    <main className="page-fill mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">จัดการบัญชีผู้ใช้</h1>
        <p className="text-muted-foreground text-sm">
          ให้หรือถอนสิทธิ์ผู้ดูแลระบบ และเปิดหรือระงับการใช้งานบัญชี
          {!loading && !error
            ? ` — ทั้งหมด ${accounts.length} บัญชี, เป็นผู้ดูแลระบบ ${activeAdmins}, เจ้าหน้าที่ ${officers}`
            : null}
        </p>
      </header>

      {actionError ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive text-base">แก้ไขบัญชีไม่สำเร็จ</CardTitle>
            <CardDescription>{actionError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="text-destructive p-6 text-sm">{error}</p>
          ) : loading ? (
            <p className="text-muted-foreground p-6 text-sm">กำลังโหลดรายชื่อบัญชี…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>บัญชี</TableHead>
                  <TableHead>บทบาท</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="text-right">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => {
                  const isSelf = account.id === currentUserId;
                  const isLastAdmin =
                    account.role === 'admin' && account.is_active && activeAdmins <= 1;
                  const busy = pendingId === account.id;
                  const lockRole = isSelf || (account.role === 'admin' && isLastAdmin);
                  const lockActive = isSelf || isLastAdmin;

                  return (
                    <TableRow key={account.id} className={cn(!account.is_active && 'opacity-60')}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-lg">
                            <UserRound aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {account.full_name || account.username}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {account.username}
                              {isSelf ? ' · บัญชีของคุณ' : ''}
                            </span>
                          </span>
                        </span>
                      </TableCell>

                      <TableCell>
                        <RoleBadge role={account.role} />
                      </TableCell>

                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-sm',
                            account.is_active ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'size-1.5 rounded-full',
                              account.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                            )}
                          />
                          {account.is_active ? 'ใช้งานอยู่' : 'ถูกระงับ'}
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            className={ACTION}
                            disabled={busy || lockRole}
                            title={
                              isSelf
                                ? 'ไม่สามารถแก้ไขบัญชีของตัวเองได้'
                                : isLastAdmin
                                  ? 'ผู้ดูแลระบบคนสุดท้ายที่ยังใช้งานอยู่'
                                  : undefined
                            }
                            onClick={() =>
                              updateAccount(account.id, {
                                role:
                                  account.role === 'admin'
                                    ? 'business_development_officer'
                                    : 'admin',
                              })
                            }
                          >
                            {account.role === 'admin' ? 'ถอนสิทธิ์ผู้ดูแล' : 'ตั้งเป็นผู้ดูแลระบบ'}
                          </Button>
                          <Button
                            variant="ghost"
                            className={ACTION}
                            disabled={busy || lockActive}
                            title={
                              isSelf
                                ? 'ไม่สามารถแก้ไขบัญชีของตัวเองได้'
                                : isLastAdmin
                                  ? 'ผู้ดูแลระบบคนสุดท้ายที่ยังใช้งานอยู่'
                                  : undefined
                            }
                            onClick={() =>
                              updateAccount(account.id, { is_active: !account.is_active })
                            }
                          >
                            {account.is_active ? 'ระงับบัญชี' : 'เปิดใช้งาน'}
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
