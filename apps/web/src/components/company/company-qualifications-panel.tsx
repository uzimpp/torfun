'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  certificateExpired,
  CompanyQualificationsRecordSchema,
  thailandDay,
  type CompanyCertificate,
  type CompanyQualificationsRecord,
  type PersonnelQualification,
} from '@torfun/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError, fetchCompanyQualifications, saveCompanyQualifications } from '@/lib/api';

export function CompanyQualificationsPanel({ companyId }: { companyId: string }) {
  const [profile, setProfile] = useState<CompanyQualificationsRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyQualifications().then(
      (data) => {
        if (cancelled) return;
        if (data?.companyId === companyId) setProfile(data);
        else setLoadError(true);
      },
      () => {
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, loadAttempt]);

  function reload() {
    setEditing(false);
    setProfile(null);
    setLoadError(false);
    setLoadAttempt((attempt) => attempt + 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>คุณสมบัติของบริษัท</CardTitle>
        <p className="text-muted-foreground text-sm">ใช้เทียบกับข้อกำหนดผู้เสนอราคาใน TOR</p>
      </CardHeader>
      <CardContent>
        {loadError && (
          <div className="space-y-3">
            <p role="alert" className="text-sm">
              โหลดข้อมูลคุณสมบัติบริษัทไม่สำเร็จ
            </p>
            <Button type="button" variant="outline" onClick={reload}>
              ลองใหม่
            </Button>
          </div>
        )}
        {!profile && !loadError && (
          <p role="status" className="text-sm">
            กำลังโหลดข้อมูลคุณสมบัติ
          </p>
        )}
        {profile &&
          (editing ? (
            <QualificationsForm
              profile={profile}
              onCancel={() => setEditing(false)}
              onReload={reload}
              onSaved={(updated) => {
                setProfile(updated);
                setEditing(false);
              }}
            />
          ) : (
            <QualificationsOverview profile={profile} onEdit={() => setEditing(true)} />
          ))}
      </CardContent>
    </Card>
  );
}

function QualificationsOverview({
  profile,
  onEdit,
}: {
  profile: CompanyQualificationsRecord;
  onEdit: () => void;
}) {
  const today = thailandDay(new Date());
  return (
    <div className="grid gap-5 text-sm">
      <p>
        ทุนจดทะเบียน{' '}
        {profile.registeredCapitalThb === null
          ? 'ยังไม่ได้ระบุ'
          : `${profile.registeredCapitalThb.toLocaleString('th-TH')} บาท`}
      </p>
      <div>
        <h3 className="font-medium">ใบรับรองบริษัท</h3>
        {profile.certificates.length ? (
          <ul className="mt-2 space-y-2">
            {profile.certificates.map((item, index) => (
              <li key={index}>
                {item.name} · {item.standard} · {item.issuer} · ใช้ได้ถึง {item.validUntil}
                {certificateExpired(item, today) && (
                  <strong className="text-destructive"> · หมดอายุ</strong>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2">ยังไม่มีใบรับรองบริษัท</p>
        )}
      </div>
      <div>
        <h3 className="font-medium">บุคลากร</h3>
        {profile.personnel.length ? (
          <ul className="mt-2 space-y-2">
            {profile.personnel.map((item, index) => (
              <li key={index}>
                {item.role} · {item.degree ?? 'ไม่ระบุวุฒิ'} ·{' '}
                {item.yearsOfExperience === null
                  ? 'ไม่ระบุประสบการณ์'
                  : `ประสบการณ์ ${item.yearsOfExperience} ปี`}
                {item.certificates?.length ? ` · ${item.certificates.join(', ')}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2">ยังไม่มีข้อมูลบุคลากร</p>
        )}
      </div>
      <div>
        <Button type="button" variant="outline" onClick={onEdit}>
          แก้ไขคุณสมบัติ
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function QualificationsForm({
  profile,
  onCancel,
  onSaved,
  onReload,
}: {
  profile: CompanyQualificationsRecord;
  onCancel: () => void;
  onSaved: (profile: CompanyQualificationsRecord) => void;
  onReload: () => void;
}) {
  const nextKey = useRef(0);
  const [certificates, setCertificates] = useState(() =>
    profile.certificates.map((item, index) => ({
      id: `cert-${index}`,
      item: item as CompanyCertificate | null,
    })),
  );
  const [personnel, setPersonnel] = useState(() =>
    profile.personnel.map((item, index) => ({
      id: `person-${index}`,
      item: item as PersonnelQualification | null,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || conflict) return;
    setError(null);
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const number = (name: string) => (value(name) === '' ? null : Number(value(name)));
    const parsed = CompanyQualificationsRecordSchema.safeParse({
      companyId: profile.companyId,
      revision: profile.revision,
      registeredCapitalThb: number('capital'),
      certificates: certificates.map(({ id }) => ({
        name: value(`${id}-name`),
        standard: value(`${id}-standard`),
        issuer: value(`${id}-issuer`),
        validUntil: value(`${id}-until`),
      })),
      personnel: personnel.map(({ id }) => ({
        role: value(`${id}-role`),
        yearsOfExperience: number(`${id}-years`),
        degree: value(`${id}-degree`) || null,
        certificates:
          data.has(`${id}-known`) || value(`${id}-certificates`)
            ? value(`${id}-certificates`)
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
            : null,
      })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.path.includes('certificates') && issue.code === 'custom'
          ? issue.message
          : 'กรุณาตรวจสอบข้อมูลในแบบฟอร์มและลองอีกครั้ง',
      );
      return;
    }
    setSaving(true);
    try {
      onSaved(await saveCompanyQualifications(parsed.data));
    } catch (cause) {
      if (cause instanceof ApiError && [404, 409].includes(cause.status)) {
        setConflict(true);
        setError('ข้อมูลบริษัทเปลี่ยนแปลง กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
      } else {
        setError('บันทึกข้อมูลคุณสมบัติไม่สำเร็จ กรุณาลองอีกครั้ง');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="grid gap-6">
      <fieldset disabled={saving || conflict} className="grid gap-6">
        <Field label="ทุนจดทะเบียนเป็นบาท">
          <Input
            name="capital"
            type="number"
            min={0}
            max={Number.MAX_SAFE_INTEGER}
            step="0.01"
            defaultValue={profile.registeredCapitalThb ?? ''}
          />
        </Field>
        <fieldset className="grid gap-3">
          <legend className="mb-3 font-medium">ใบรับรองบริษัท</legend>
          {certificates.map(({ id, item }, index) => (
            <fieldset key={id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm">ใบรับรอง {index + 1}</legend>
              <Field label="ชื่อใบรับรอง">
                <Input name={`${id}-name`} required maxLength={200} defaultValue={item?.name} />
              </Field>
              <Field label="มาตรฐาน">
                <Input
                  name={`${id}-standard`}
                  required
                  maxLength={200}
                  defaultValue={item?.standard}
                />
              </Field>
              <Field label="ผู้ออกใบรับรอง">
                <Input name={`${id}-issuer`} required maxLength={200} defaultValue={item?.issuer} />
              </Field>
              <Field label="ใช้ได้ถึง">
                <Input name={`${id}-until`} required type="date" defaultValue={item?.validUntil} />
              </Field>
              <Button
                type="button"
                variant="ghost"
                className="justify-self-start"
                onClick={() => setCertificates((rows) => rows.filter((row) => row.id !== id))}
              >
                นำใบรับรองออก
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={certificates.length >= 100}
            onClick={() => {
              const id = `new-${nextKey.current++}`;
              setCertificates((rows) => [...rows, { id, item: null }]);
            }}
          >
            เพิ่มใบรับรองบริษัท
          </Button>
        </fieldset>
        <fieldset className="grid gap-3">
          <legend className="mb-3 font-medium">บุคลากร</legend>
          <p className="text-muted-foreground text-sm">
            เพิ่มหนึ่งรายการต่อคน โดยใช้เฉพาะข้อมูลคุณสมบัติ
          </p>
          {personnel.map(({ id, item }, index) => (
            <fieldset key={id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm">บุคลากรคนที่ {index + 1}</legend>
              <Field label="บทบาท">
                <Input name={`${id}-role`} required maxLength={200} defaultValue={item?.role} />
              </Field>
              <Field label="ประสบการณ์เป็นปี">
                <Input
                  name={`${id}-years`}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={item?.yearsOfExperience ?? ''}
                />
              </Field>
              <Field label="วุฒิการศึกษา">
                <Input name={`${id}-degree`} maxLength={200} defaultValue={item?.degree ?? ''} />
              </Field>
              <Field label="ใบรับรองบุคคล (คั่นด้วยจุลภาค)">
                <Input name={`${id}-certificates`} defaultValue={item?.certificates?.join(', ')} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`${id}-known`}
                  defaultChecked={item?.certificates?.length === 0}
                />
                ยืนยันว่าบุคลากรรายนี้ไม่มีใบรับรอง
              </label>
              <Button
                type="button"
                variant="ghost"
                className="justify-self-start"
                onClick={() => setPersonnel((rows) => rows.filter((row) => row.id !== id))}
              >
                นำบุคลากรออก
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            disabled={personnel.length >= 100}
            onClick={() => {
              const id = `new-${nextKey.current++}`;
              setPersonnel((rows) => [...rows, { id, item: null }]);
            }}
          >
            เพิ่มบุคลากร
          </Button>
        </fieldset>
      </fieldset>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving || conflict}>
          {saving ? 'กำลังบันทึก' : 'บันทึกคุณสมบัติ'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          ยกเลิก
        </Button>
        {conflict && (
          <Button type="button" variant="outline" onClick={onReload}>
            โหลดข้อมูลล่าสุด
          </Button>
        )}
      </div>
    </form>
  );
}
