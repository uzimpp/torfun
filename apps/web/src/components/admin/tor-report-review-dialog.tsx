'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  ReviewTorReportSchema,
  TOR_REPORT_REASON_LABELS,
  type ReviewTorReport,
  type TorReportResponse,
} from '@torfun/types';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function TorReportReviewDialog({
  report,
  action,
  onCancel,
  onConfirm,
}: {
  report: TorReportResponse;
  action: ReviewTorReport['action'];
  onCancel: () => void;
  onConfirm: (input: ReviewTorReport) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const id = useId();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const removing = action === 'remove_tor';

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    cancelButton.current?.focus();
    return () => dialog?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || stale) return;
    const input = ReviewTorReportSchema.safeParse({ action, note });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? 'กรุณาตรวจสอบบันทึก');
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm(input.data);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setStale([404, 409].includes(caught.status));
        setError(
          caught.status === 0
            ? 'เชื่อมต่อ API ไม่สำเร็จ กรุณาลองอีกครั้ง'
            : caught.status === 401
              ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
              : caught.status === 403
                ? 'บัญชีนี้ไม่มีสิทธิ์ตรวจสอบรายงานแล้ว'
                : caught.status >= 500
                  ? 'บันทึกผลการตรวจสอบไม่สำเร็จ กรุณาลองอีกครั้ง'
                  : caught.message,
        );
      } else setError('บันทึกผลการตรวจสอบไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        if (busy.current) event.preventDefault();
        else onCancel();
      }}
      className="bg-popover text-popover-foreground fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border p-6 shadow-xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-black/50"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {removing ? 'ยืนยันนำ TOR ออกจากการเผยแพร่' : 'ยืนยันปิดรายงาน'}
      </h2>
      <p id={`${id}-description`} className="text-muted-foreground mt-3 text-sm leading-relaxed">
        {removing
          ? 'TOR นี้จะไม่แสดงในการค้นหา และเจ้าหน้าที่พัฒนาธุรกิจจะเปิดหรือดาวน์โหลดไม่ได้ ผู้ดูแลระบบยังเข้าถึงต้นฉบับและประวัติได้'
          : 'ปิดรายงานนี้โดยไม่เปลี่ยนการเผยแพร่ TOR ข้อมูลผู้รายงานและผลการตรวจสอบจะยังอยู่ในประวัติ'}
      </p>
      <div className="bg-muted/60 mt-4 space-y-2 rounded-lg p-3 text-sm">
        <p className="leading-relaxed font-medium">{report.project_name}</p>
        <p className="text-muted-foreground">{TOR_REPORT_REASON_LABELS[report.reason]}</p>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={pending}>
        <div className="space-y-2">
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            บันทึกการตรวจสอบ (ไม่บังคับ)
          </label>
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            ไม่เกิน 2,000 ตัวอักษร
          </p>
          <Textarea
            id={`${id}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            disabled={pending}
            rows={3}
            aria-describedby={`${id}-hint`}
          />
        </div>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button
            ref={cancelButton}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            ยกเลิก
          </Button>
          <Button
            type="submit"
            variant={removing ? 'destructive' : 'default'}
            disabled={pending || stale}
          >
            {pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {pending ? 'กำลังบันทึก…' : removing ? 'ยืนยันนำ TOR ออก' : 'ยืนยันปิดรายงาน'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
