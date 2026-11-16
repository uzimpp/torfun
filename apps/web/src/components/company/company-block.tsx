'use client';

import { useId, useState, type FormEvent } from 'react';
import { hasRecognisableLegalForm, ThaiCompanyName, Tin } from '@torfun/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FLOW_ACTION, FLOW_FIELD, FLOW_FIELD_GROUP } from '@/components/onboarding/controls';
import { Label } from '@/components/ui/label';
import type { CompanyInput, CompanyResponse } from '@/lib/api';
import { CompanyTypeahead } from './company-typeahead';

/**
 * The Company a Business Development Officer works for — the vendor side of a
 * match, and the thing every Experience hangs off.
 *
 * An officer with no Company searches first, because joining the record a
 * colleague already made is the common case; creating one is what happens when
 * nothing matches.
 */
export function CompanyBlock({
  company,
  saving,
  onCreate,
  onJoin,
  onEdit,
}: {
  company: CompanyResponse | null;
  saving: boolean;
  onCreate: (input: CompanyInput) => Promise<boolean>;
  onJoin: (id: string) => Promise<boolean>;
  onEdit: (input: Partial<CompanyInput>) => Promise<boolean>;
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
    const parsedTin = trimmedTin === '' ? null : Tin.safeParse(trimmedTin);
    setTinError(
      parsedTin === null || parsedTin.success
        ? null
        : (parsedTin.error.issues[0]?.message ?? 'TIN ไม่ถูกต้อง'),
    );

    if (!name.success || (parsedTin !== null && !parsedTin.success)) return;

    const input: CompanyInput = { name_th: name.data, tin: trimmedTin === '' ? null : trimmedTin };
    const saved = company ? await onEdit(input) : await onCreate(input);
    if (saved) setSwitching(false);
  }

  const showTypeahead = company === null || switching;

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
        {showTypeahead ? (
          <CompanyTypeahead
            disabled={saving}
            onJoin={async (found) => {
              const joined = await onJoin(found.id);
              if (joined) {
                setNameTh(found.name_th);
                setTin(found.tin ?? '');
                setSwitching(false);
              }
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
            <Label htmlFor={tinId}>เลขประจำตัวผู้เสียภาษี (ไม่บังคับ)</Label>
            <Input
              id={tinId}
              className={FLOW_FIELD}
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

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={saving} className={FLOW_ACTION}>
              {company ? 'บันทึกการแก้ไข' : 'บันทึกบริษัท'}
            </Button>
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
