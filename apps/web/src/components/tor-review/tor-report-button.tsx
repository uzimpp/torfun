'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Flag, LoaderCircle, X } from 'lucide-react';
import { CreateTorReportSchema, TOR_REPORT_REASON_LABELS, TorReportReason } from '@torfun/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, submitTorReport } from '@/lib/api';

export function TorReportButton({ projectId }: { projectId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const id = useId();
  const [reason, setReason] = useState<TorReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [pending, setPending] = useState(false);
  const [reported, setReported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function openReport() {
    setError(null);
    dialog.current?.showModal();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const input = CreateTorReportSchema.safeParse({
      reason,
      ...(reason === 'other' ? { details } : {}),
    });
    if (!input.success) {
      setError(
        reason === null
          ? 'กรุณาเลือกเหตุผลในการรายงาน'
          : (input.error.issues[0]?.message ?? 'กรุณาตรวจสอบรายละเอียด'),
      );
      if (reason === 'other') dialog.current?.querySelector('textarea')?.focus();
      else dialog.current?.querySelector('input')?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await submitTorReport(projectId, input.data);
      setReported(true);
      dialog.current?.close();
      setToast(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.status === 0
            ? 'เชื่อมต่อ API ไม่สำเร็จ กรุณาลองอีกครั้ง'
            : caught.status === 401
              ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่ก่อนส่งรายงาน'
              : caught.message
          : 'ส่งรายงานไม่สำเร็จ กรุณาลองอีกครั้ง',
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        onClick={openReport}
        disabled={reported}
      >
        <Flag aria-hidden="true" />
        {reported ? 'ส่งรายงาน TOR แล้ว' : 'รายงาน TOR'}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => event.preventDefault()}
        className="bg-popover text-popover-foreground fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            รายงาน TOR
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="ปิดหน้าต่างรายงาน"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <p id={`${id}-description`} className="text-muted-foreground mt-2 text-sm leading-relaxed">
          เลือกเหตุผลเพื่อให้ผู้ดูแลระบบตรวจสอบ การรายงานจะไม่ซ่อนหรือลบ TOR โดยอัตโนมัติ
        </p>
        <form onSubmit={submit} noValidate className="mt-5 space-y-5" aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-2">
            <legend className="mb-3 text-sm font-medium">เหตุผลในการรายงาน (เลือกได้ 1 ข้อ)</legend>
            {TorReportReason.options.map((value) => (
              <label
                key={value}
                htmlFor={`${id}-${value}`}
                className="border-border hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm"
              >
                <input
                  id={`${id}-${value}`}
                  type="radio"
                  name={`${id}-reason`}
                  value={value}
                  required
                  checked={reason === value}
                  onChange={() => {
                    setReason(value);
                    setError(null);
                  }}
                  className="accent-primary mt-0.5 size-4 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                {TOR_REPORT_REASON_LABELS[value]}
              </label>
            ))}
          </fieldset>
          {reason === 'other' && (
            <div className="space-y-2">
              <label htmlFor={`${id}-details`} className="text-sm font-medium">
                รายละเอียดเพิ่มเติม (จำเป็น)
              </label>
              <p id={`${id}-details-hint`} className="text-muted-foreground text-xs">
                อธิบายปัญหาที่พบ ไม่เกิน 2,000 ตัวอักษร
              </p>
              <Textarea
                id={`${id}-details`}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                required
                maxLength={2000}
                disabled={pending}
                rows={4}
                aria-describedby={`${id}-details-hint${error ? ` ${id}-error` : ''}`}
                aria-invalid={Boolean(error)}
              />
            </div>
          )}
          {error && (
            <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              ปิด
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {pending ? 'กำลังส่งรายงาน…' : 'ส่งรายงาน'}
            </Button>
          </div>
        </form>
      </dialog>
      <div role="status" aria-atomic="true">
        {toast && (
          <div className="bg-popover text-popover-foreground fixed right-4 bottom-4 z-50 flex max-w-[calc(100%-2rem)] items-start gap-3 rounded-xl border p-4 shadow-lg">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p className="text-sm">ส่งรายงานแล้ว ผู้ดูแลระบบจะตรวจสอบ TOR นี้</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="ปิดข้อความแจ้งเตือน"
              onClick={() => setToast(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
