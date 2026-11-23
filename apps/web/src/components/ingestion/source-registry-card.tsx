'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { LogIn, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react';
import { SourceAgencyInputSchema, type SourceAgency } from '@torfun/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSourceRegistry, type SourceRegistryData } from './use-source-registry';

type Mutations = Pick<SourceRegistryData, 'busy' | 'edit' | 'remove'>;

function AgencyRow({ agency, data }: { agency: SourceAgency; data: Mutations }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(agency.deptName);
  const inputId = useId();

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') return;
    if (await data.edit(agency.deptId, { deptName: name })) setEditing(false);
  };

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      {editing ? (
        <form onSubmit={save} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Label htmlFor={inputId} className="sr-only">
            ชื่อหน่วยงาน {agency.deptId}
          </Label>
          <Input
            id={inputId}
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" disabled={data.busy || name.trim() === ''} className="min-h-11">
            บันทึก
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={data.busy}
            onClick={() => {
              setName(agency.deptName);
              setEditing(false);
            }}
            className="min-h-11"
          >
            ยกเลิก
          </Button>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium break-words">{agency.deptName}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              รหัสหน่วยงาน {agency.deptId}
            </span>
          </div>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">
                ลบแล้วรอบถัดไปจะไม่ดึงจากหน่วยงานนี้ ประกาศที่ดึงไว้แล้วยังคงอยู่
              </span>
              <Button
                type="button"
                variant="destructive"
                disabled={data.busy}
                onClick={async () => {
                  await data.remove(agency.deptId);
                  setConfirming(false);
                }}
                className="min-h-11"
              >
                ยืนยันการลบ
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={data.busy}
                onClick={() => setConfirming(false)}
                className="min-h-11"
              >
                ยกเลิก
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`แก้ไขชื่อ ${agency.deptName}`}
                disabled={data.busy}
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`ลบ ${agency.deptName}`}
                disabled={data.busy}
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function AddForm({ data }: { data: Pick<SourceRegistryData, 'busy' | 'add'> }) {
  const [deptId, setDeptId] = useState('');
  const [deptName, setDeptName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = SourceAgencyInputSchema.safeParse({ deptId, deptName });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
      return;
    }
    setProblem(null);
    if (await data.add(parsed.data)) {
      setDeptId('');
      setDeptName('');
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="grid gap-3 @md:grid-cols-[10rem_1fr_auto] @md:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-id`} className="text-muted-foreground text-xs">
            รหัสหน่วยงาน e-GP
          </Label>
          <Input
            id={`${id}-id`}
            inputMode="numeric"
            value={deptId}
            maxLength={7}
            onChange={(event) => setDeptId(event.target.value)}
            className="h-11 tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-name`} className="text-muted-foreground text-xs">
            ชื่อหน่วยงาน
          </Label>
          <Input
            id={`${id}-name`}
            value={deptName}
            maxLength={200}
            onChange={(event) => setDeptName(event.target.value)}
            className="h-11"
          />
        </div>
        <Button type="submit" disabled={data.busy} className="min-h-11 px-5">
          <Plus data-icon="inline-start" className="size-4" aria-hidden="true" />
          เพิ่มหน่วยงาน
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

function SessionEnded() {
  return (
    <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}>
      <LogIn className="size-4" aria-hidden="true" />
      เข้าสู่ระบบอีกครั้ง
    </Link>
  );
}

/**
 * The Source Registry: which agencies the next Run reads from e-GP's feed. A
 * Site Administrator's control. Removing an agency never deletes what was already
 * ingested.
 */
export function SourceRegistrySettings() {
  const data = useSourceRegistry();
  const { registry, loading, error, sessionEnded, busy, actionError, retry } = data;

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="กำลังโหลดรายชื่อหน่วยงาน"
        className="bg-muted h-32 animate-pulse rounded-md motion-reduce:animate-none"
      />
    );
  }
  if (error || !registry) {
    return (
      <div role="alert" className="border-destructive/50 flex flex-col gap-3 rounded-md border p-4">
        <p className="text-destructive text-sm">{sessionEnded ? 'เซสชันหมดอายุ' : error}</p>
        {sessionEnded ? (
          <SessionEnded />
        ) : (
          <div>
            <Button variant="outline" onClick={retry} className="min-h-11">
              <RotateCw className="size-4" aria-hidden="true" />
              ลองอีกครั้ง
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="@container flex flex-col gap-6">
      {registry.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          ยังไม่มีหน่วยงานในรายการ รอบดึงข้อมูลจะไม่ดึงประกาศใหม่จนกว่าจะเพิ่มหน่วยงาน
        </p>
      ) : (
        <ul aria-label="หน่วยงานที่ดึงข้อมูล" className="divide-border divide-y">
          {registry.items.map((agency) => (
            <AgencyRow key={agency.deptId} agency={agency} data={data} />
          ))}
        </ul>
      )}

      {registry.available.length > 0 ? (
        <section aria-label="หน่วยงานที่เลือกได้" className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs">หน่วยงานที่เลือกเพิ่มได้</h3>
          <div className="flex flex-wrap gap-2">
            {registry.available.map((agency) => (
              <Button
                key={agency.deptId}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void data.add(agency)}
                className="min-h-11"
              >
                <Plus data-icon="inline-start" className="size-4" aria-hidden="true" />
                {agency.deptName} ({agency.deptId})
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <AddForm data={data} />

      <p className="text-muted-foreground max-w-prose text-sm">
        การเปลี่ยนแปลงมีผลกับรอบถัดไป รอบที่กำลังทำงานอยู่ใช้รายการเดิม
        การลบหน่วยงานไม่ลบประกาศที่ดึงเข้าระบบแล้ว รหัสหน่วยงานคือรหัสที่ฟีดประกาศของ e-GP
        ใช้ระบุหน่วยงาน
      </p>

      {actionError ? (
        <div
          role="alert"
          className="border-destructive/50 flex flex-col gap-3 rounded-md border p-4"
        >
          <p className="text-destructive text-sm">{actionError}</p>
          {sessionEnded ? <SessionEnded /> : null}
        </div>
      ) : null}
    </div>
  );
}
