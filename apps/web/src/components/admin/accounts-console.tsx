'use client';

import { ShieldCheck, ShieldOff, UserCheck, UserRound, UserX } from 'lucide-react';
import type { AdminUserResponse } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/layout/page-header';
import { cn } from '@/lib/utils';
import { AdminLoadError } from './admin-load-error';
import { AdminPage, TABLE_HEAD } from './admin-ui';
import { LoadingRegion } from './loading-region';
import { STATUS_STYLE } from './status-badge';
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
    <AdminPage>
      <PageHeader
        crumbs={[{ label: 'ผู้ดูแลระบบ', href: '/dashboard' }, { label: 'จัดการบัญชีผู้ใช้' }]}
        title="จัดการบัญชีผู้ใช้"
        description="ให้หรือถอนสิทธิ์ผู้ดูแลระบบ และเปิดหรือระงับการใช้งานบัญชี"
        meta={
          !loading && !error ? (
            <>
              <span>ทั้งหมด {accounts.length} บัญชี</span>
              <span>เป็นผู้ดูแลระบบ {activeAdmins}</span>
              <span>เจ้าหน้าที่ {officers}</span>
            </>
          ) : null
        }
      />

      {actionError ? (
        <AdminLoadError
          error={{ kind: 'broken', message: actionError }}
          title="แก้ไขบัญชีไม่สำเร็จ"
        />
      ) : null}

      {error ? (
        <AdminLoadError error={{ kind: 'broken', message: error }} />
      ) : (
        <div className="bg-card rounded-lg border">
          {loading ? (
            <LoadingRegion label="กำลังโหลดรายชื่อบัญชี" className="flex flex-col divide-y">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-7 w-28" />
                </div>
              ))}
            </LoadingRegion>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TABLE_HEAD, 'px-3')}>บัญชี</TableHead>
                  <TableHead className={cn(TABLE_HEAD, 'px-3')}>บทบาท</TableHead>
                  <TableHead className={cn(TABLE_HEAD, 'px-3')}>สถานะ</TableHead>
                  <TableHead className={cn(TABLE_HEAD, 'px-3 text-right')}>การจัดการ</TableHead>
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
                      <TableCell className="px-3">
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

                      <TableCell className="px-3">
                        <RoleBadge role={account.role} />
                      </TableCell>

                      <TableCell className="px-3">
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
                              account.is_active
                                ? STATUS_STYLE.analysed.dot
                                : 'bg-muted-foreground/50',
                            )}
                          />
                          {account.is_active ? 'ใช้งานอยู่' : 'ถูกระงับ'}
                        </span>
                      </TableCell>

                      <TableCell className="px-3">
                        <span className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
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
                            {account.role === 'admin' ? (
                              <ShieldOff className="size-4" aria-hidden="true" />
                            ) : (
                              <ShieldCheck className="size-4" aria-hidden="true" />
                            )}
                            {account.role === 'admin' ? 'ถอนสิทธิ์ผู้ดูแล' : 'ตั้งเป็นผู้ดูแลระบบ'}
                          </Button>
                          <Button
                            variant={account.is_active ? 'destructive' : 'outline'}
                            size="sm"
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
                            {account.is_active ? (
                              <UserX className="size-4" aria-hidden="true" />
                            ) : (
                              <UserCheck className="size-4" aria-hidden="true" />
                            )}
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
        </div>
      )}
    </AdminPage>
  );
}
