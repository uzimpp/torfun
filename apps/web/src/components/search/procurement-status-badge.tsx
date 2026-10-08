import { Clock } from 'lucide-react';
import { STATUS_LABELS, type ProcurementStatus, type StatusSource } from '@torfun/types';

import { cn } from '@/lib/utils';

/**
 * Where a procurement is in the agency's own e-GP lifecycle, in Thai.
 *
 * The stage is always spelled out — colour never carries it alone — so it reads
 * in monochrome print and for colour-blind users. Two stages are set apart:
 * `drafting` gets an icon and a reason, because it is the officer's chance to
 * prepare before the invitation is published; `open` is the only stage a bid is
 * possible in.
 *
 * A stage Gemini read out of the documents is labelled as such and points the
 * reader back to the original: an AI reading is a summary, never an authority.
 */

const STYLES: Record<ProcurementStatus, string> = {
  drafting:
    'bg-amber-100 text-amber-950 ring-1 ring-amber-600/50 font-semibold dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-400/50',
  open: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  evaluating: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  awarded: 'bg-muted text-foreground',
  contracted: 'bg-muted text-foreground',
  cancelled: 'bg-muted text-muted-foreground line-through decoration-1',
  unknown: 'text-muted-foreground border-border border border-dashed',
};

const AI_NOTE = 'AI อ่านสถานะนี้จากเอกสาร — โปรดตรวจสอบกับเอกสารต้นฉบับก่อนตัดสินใจ';
const DRAFTING_NOTE = 'อยู่ในช่วงร่าง/เตรียมการ — เตรียมตัวล่วงหน้าได้ก่อนประกาศเชิญชวน';

export function ProcurementStatusBadge({
  status,
  source,
}: {
  status: ProcurementStatus;
  source: StatusSource | null;
}) {
  const fromAi = source === 'ai' && status !== 'unknown';
  const notes = [status === 'drafting' ? DRAFTING_NOTE : null, fromAi ? AI_NOTE : null].filter(
    Boolean,
  );

  return (
    <span
      data-status={status}
      {...(status === 'drafting' ? { 'data-emphasis': 'prepare-ahead' } : {})}
      title={notes.length > 0 ? notes.join(' · ') : undefined}
      className={cn(
        'inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        STYLES[status],
      )}
    >
      {status === 'drafting' && <Clock aria-hidden="true" className="size-3.5 shrink-0" />}
      {STATUS_LABELS[status]}
      {fromAi && (
        <span className="rounded border border-current/40 px-1 text-[10px] leading-4 font-medium">
          AI ประเมิน
        </span>
      )}
    </span>
  );
}
