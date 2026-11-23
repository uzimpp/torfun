'use client';

import { useId, useState, type FormEvent } from 'react';
import { hasRecognisableLegalForm, ThaiCompanyName, Tin } from '@torfun/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FLOW_ACTION, FLOW_FIELD, FLOW_FIELD_GROUP } from '@/components/onboarding/controls';
import { Label } from '@/components/ui/label';
import type { CompanyInput, MyCompanyResponse, PendingJoinRequest } from '@/lib/api';
import { CompanyTypeahead } from './company-typeahead';

/**
 * The Company a Business Development Officer works for — the vendor side of a
 * match, and the thing every Experience hangs off.
 *
 * An officer with no Company searches first, because joining the record a
 * colleague already made is the common case; creating one is what happens when
 * nothing matches. Joining is a request a Company Manager (ผู้ดูแลบริษัท)
 * approves, so until then the block says who the officer is waiting on. Only a
 * manager edits the name and TIN; everyone else reads them.
 */
export function CompanyBlock({
  company,
  pendingRequest,
  saving,
  onCreate,
  onJoin,
  onEdit,
  onWithdraw,
}: {
  company: MyCompanyResponse | null;
  pendingRequest: PendingJoinRequest | null;
  saving: boolean;
  onCreate: (input: CompanyInput) => Promise<boolean>;
  onJoin: (id: string) => Promise<'joined' | 'pending' | null>;
  onEdit: (input: Partial<CompanyInput>) => Promise<boolean>;
  onWithdraw: () => Promise<boolean>;
}) {
  const nameId = useId();
  const tinId = useId();

  const [nameTh, setNameTh] = useState(company?.name_th ?? '');
  const [tin, setTin] = useState(company?.tin ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [tinError, setTinError] = useState<string | null>(null);
  /** Only meaningful once a company exists: whether the officer is switching. */
  const [switching, setSwitching] = useState(false);

  // A hint, never a rejection — the list of legal forms can never be complete,
  // so a name it does not recognise is far more likely to be unusual than wrong.
  const legalFormHint = nameTh.trim() !== '' && !hasRecognisableLegalForm(nameTh);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = ThaiCompanyName.safeParse(nameTh);
    setNameError(name.success ? null : (name.error.issues[0]?.message ?? 'ชื่อบริษัทไม่ถูกต้อง'));

    const trimmedTin = tin.trim();
    // Required: the TIN is what makes this company one record rather than a copy of someone's.
    const parsedTin = Tin.safeParse(trimmedTin);
    setTinError(
      parsedTin.success
        ? null
        : trimmedTin === ''
          ? 'กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก'
          : (parsedTin.error.issues[0]?.message ?? 'TIN ไม่ถูกต้อง'),
    );

    if (!name.success || !parsedTin.success) return;

    const input: CompanyInput = { name_th: name.data, tin: parsedTin.data };
    const saved = company ? await onEdit(input) : await onCreate(input);
    if (saved) setSwitching(false);
  }

  const showTypeahead = company === null || switching;
  /** A member who is not a manager reads the record; the API refuses their edits anyway. */
  const readOnly = company !== null && !company.is_manager;

  return (
    <Card>
      <CardHeader>
        <CardTitle>บริษัทของคุณ</CardTitle>
        <CardDescription>
          {company
            ? 'ผลงานทั้งหมดถูกบันทึกไว้กับบริษัทนี้ เพื่อนร่วมงานที่อยู่บริษัทเดียวกันจะเห็นรายการเดียวกัน'
            : 'ค้นหาบริษัทที่เพื่อนร่วมงานสร้างไว้แล้ว หรือสร้างใหม่หากยังไม่มี'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {pendingRequest ? (
          <div
            role="status"
            className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
          >
            <p>
              ส่งคำขอเข้าร่วม <span className="font-medium">{pendingRequest.company.name_th}</span>{' '}
              แล้ว รอผู้ดูแลบริษัทอนุมัติ
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => void onWithdraw()}
            >
              ยกเลิกคำขอ
            </Button>
          </div>
        ) : null}

        {showTypeahead ? (
          <CompanyTypeahead
            disabled={saving}
            onJoin={async (found) => {
              const outcome = await onJoin(found.id);
              if (outcome === 'joined') {
                setNameTh(found.name_th);
                setTin(found.tin ?? '');
              }
              if (outcome !== null) setSwitching(false);
            }}
            onCreateNew={(name) => {
              setNameTh(name);
              setNameError(null);
            }}
          />
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={nameId}>ชื่อบริษัท (ภาษาไทย)</Label>
            <Input
              id={nameId}
              className={FLOW_FIELD}
              readOnly={readOnly}
              value={nameTh}
              maxLength={200}
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? `${nameId}-error` : undefined}
              placeholder="เช่น บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)"
              onChange={(event) => {
                setNameTh(event.target.value);
                setNameError(null);
              }}
            />
            {nameError ? (
              <p id={`${nameId}-error`} role="alert" className="text-destructive text-xs">
                {nameError}
              </p>
            ) : null}
            {legalFormHint ? (
              <p role="status" className="text-muted-foreground text-xs">
                ไม่พบคำระบุรูปแบบนิติบุคคล เช่น บริษัท หรือ ห้างหุ้นส่วนจำกัด — ตรวจสอบอีกครั้งได้
                แต่บันทึกต่อได้เลย
              </p>
            ) : null}
          </div>

          <div className={FLOW_FIELD_GROUP}>
            <Label htmlFor={tinId}>เลขประจำตัวผู้เสียภาษี</Label>
            <Input
              id={tinId}
              className={FLOW_FIELD}
              readOnly={readOnly}
              value={tin}
              inputMode="numeric"
              maxLength={13}
              aria-invalid={tinError !== null}
              aria-describedby={tinError ? `${tinId}-error` : undefined}
              placeholder="13 หลัก"
              onChange={(event) => {
                setTin(event.target.value);
                setTinError(null);
              }}
            />
            {tinError ? (
              <p id={`${tinId}-error`} role="alert" className="text-destructive text-xs">
                {tinError}
              </p>
            ) : null}
          </div>

          {readOnly ? (
            <p className="text-muted-foreground text-xs">
              ผู้ดูแลบริษัทเป็นผู้แก้ไขชื่อและเลขประจำตัวผู้เสียภาษี
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {readOnly ? null : (
              <Button type="submit" disabled={saving} className={FLOW_ACTION}>
                {company ? 'บันทึกการแก้ไข' : 'บันทึกบริษัท'}
              </Button>
            )}
            {company ? (
              <Button
                type="button"
                variant="ghost"
                className={FLOW_ACTION}
                onClick={() => setSwitching((current) => !current)}
              >
                {switching ? 'ยกเลิกการเปลี่ยนบริษัท' : 'เปลี่ยนบริษัท'}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
