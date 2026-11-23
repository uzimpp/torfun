'use client';

import { useId, useState, type FormEvent } from 'react';
import { AutoApproveDomain } from '@torfun/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MyCompanyResponse } from '@/lib/api';
import { useCompanyMembers } from './use-company-members';

/**
 * Who belongs to the Company, and — for a Company Manager (ผู้ดูแลบริษัท) —
 * who is asking to.
 *
 * A manager answers each join request, or lets one email domain in
 * automatically. Without that gate, anyone could read a company's capital,
 * certificates and past contracts (pentest P-1). Everyone sees the member list;
 * only a manager sees requests and the controls.
 */
export function CompanyMembersPanel({
  company,
  onCompanyChanged,
}: {
  company: MyCompanyResponse;
  onCompanyChanged: () => void;
}) {
  const data = useCompanyMembers(company.is_manager, onCompanyChanged);

  return (
    <Card>
      <CardHeader>
        <CardTitle>สมาชิกบริษัท</CardTitle>
        <CardDescription>
          {company.is_manager
            ? 'คุณเป็นผู้ดูแลบริษัท อนุมัติผู้ขอเข้าร่วมก่อนที่เขาจะเห็นข้อมูลบริษัทและผลงาน'
            : 'ผู้ดูแลบริษัทเป็นผู้อนุมัติคำขอเข้าร่วม'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {data.error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm"
          >
            {data.error}
          </p>
        ) : null}

        {company.is_manager ? (
          <section aria-labelledby="join-requests-heading" className="flex flex-col gap-2">
            <h3 id="join-requests-heading" className="text-sm font-medium">
              คำขอเข้าร่วม
            </h3>
            {data.loading ? null : data.requests.length === 0 ? (
              <p className="text-muted-foreground text-sm">ไม่มีคำขอที่รออนุมัติ</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {data.requests.map((request) => (
                  <li
                    key={request.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {request.first_name} {request.last_name}
                      </p>
                      {/* The username is free text anyone can set (even to an
                          address); only the email was verified by Google, so it
                          is labelled and shown apart from the username. */}
                      <p className="text-muted-foreground truncate text-xs">
                        ชื่อผู้ใช้: {request.username}
                      </p>
                      <p className="truncate text-xs">
                        {request.email ? (
                          <>
                            อีเมลที่ยืนยันแล้ว (Google):{' '}
                            <span className="font-medium">{request.email}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">ไม่มีอีเมลที่ยืนยันแล้ว</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={data.saving}
                        aria-label={`อนุมัติ ${request.username}`}
                        onClick={() => void data.answer(request.user_id, 'approve')}
                      >
                        อนุมัติ
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={data.saving}
                        aria-label={`ปฏิเสธ ${request.username}`}
                        onClick={() => void data.answer(request.user_id, 'reject')}
                      >
                        ปฏิเสธ
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-labelledby="members-heading" className="flex flex-col gap-2">
          <h3 id="members-heading" className="text-sm font-medium">
            สมาชิก
          </h3>
          {data.loading ? (
            <p className="text-muted-foreground text-sm">กำลังโหลด…</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="truncate">
                      {member.first_name} {member.last_name}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {member.username}
                    </span>
                    {member.is_manager ? <Badge variant="secondary">ผู้ดูแลบริษัท</Badge> : null}
                  </div>
                  {company.is_manager ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={data.saving}
                        onClick={() => void data.setManager(member.id, !member.is_manager)}
                      >
                        {member.is_manager ? 'ยกเลิกสิทธิ์ผู้ดูแล' : 'ตั้งเป็นผู้ดูแล'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={data.saving}
                        aria-label={`นำ ${member.username} ออกจากบริษัท`}
                        onClick={() => void data.remove(member.id)}
                      >
                        นำออก
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {company.is_manager ? (
          <AutoApproveForm
            current={company.auto_approve_domain}
            saving={data.saving}
            onSave={data.saveAutoApprove}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The one setting a manager has. The API also insists the manager's own
 * verified email is at the domain; this form only catches typing mistakes and
 * public mail providers before the round trip.
 */
function AutoApproveForm({
  current,
  saving,
  onSave,
}: {
  current: string | null;
  saving: boolean;
  onSave: (domain: string | null) => Promise<boolean>;
}) {
  const fieldId = useId();
  const [domain, setDomain] = useState(current ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = AutoApproveDomain.safeParse(domain);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'โดเมนไม่ถูกต้อง');
      return;
    }
    setFieldError(null);
    await onSave(parsed.data);
  }

  return (
    <section aria-labelledby={`${fieldId}-heading`} className="flex flex-col gap-2">
      <h3 id={`${fieldId}-heading`} className="text-sm font-medium">
        อนุมัติอัตโนมัติ
      </h3>
      <p className="text-muted-foreground text-xs">
        {current
          ? `ผู้ที่เข้าสู่ระบบด้วย Google และมีอีเมล @${current} จะเข้าร่วมได้ทันที คนอื่นยังต้องรออนุมัติ`
          : 'ปิดอยู่ ทุกคำขอต้องรอผู้ดูแลอนุมัติ ตั้งโดเมนอีเมลของบริษัทเพื่อให้เพื่อนร่วมงานเข้าร่วมได้ทันที (ต้องเป็นโดเมนเดียวกับอีเมลของคุณ)'}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-2" noValidate>
        <div className="flex min-w-56 flex-1 flex-col gap-1">
          <Label htmlFor={fieldId} className="sr-only">
            โดเมนอีเมลของบริษัท
          </Label>
          <Input
            id={fieldId}
            value={domain}
            placeholder="example.co.th"
            aria-invalid={fieldError !== null}
            aria-describedby={fieldError ? `${fieldId}-error` : undefined}
            onChange={(event) => {
              setDomain(event.target.value);
              setFieldError(null);
            }}
          />
          {fieldError ? (
            <p id={`${fieldId}-error`} role="alert" className="text-destructive text-xs">
              {fieldError}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={saving}>
          {current ? 'เปลี่ยนโดเมน' : 'เปิดอนุมัติอัตโนมัติ'}
        </Button>
        {current ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setDomain('');
              void onSave(null);
            }}
          >
            ปิด
          </Button>
        ) : null}
      </form>
    </section>
  );
}
