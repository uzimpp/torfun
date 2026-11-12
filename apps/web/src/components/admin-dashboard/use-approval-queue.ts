'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Procurement } from '@torfun/types';
import { approveProcurement, markNonSoftware } from '@/lib/api-procurement-actions';
import { toLoadError, type LoadError } from '@/lib/api-errors';
import { useHeldData } from '@/components/ingestion/use-held-data';

export type Decision = 'approve' | 'nonSoftware';

export interface QueueEntry {
  record: Procurement;
  /** The decision has been sent and not yet answered. */
  busy: boolean;
  /** Why the last decision on this record was refused. */
  error: LoadError | null;
}

export interface ApprovalQueueState {
  /** Null until the first read. */
  entries: QueueEntry[] | null;
  /** The server's held total, less records decided here that its last read still listed. */
  total: number;
  loadError: LoadError | null;
  retry: () => void;
  decide: (record: Procurement, decision: Decision) => Promise<void>;
  /** The last decision that went through, for the live region. */
  announcement: string;
}

const SEND: Record<Decision, (projectId: string) => Promise<void>> = {
  approve: approveProcurement,
  nonSoftware: markNonSoftware,
};

const DONE: Record<Decision, string> = {
  approve: 'อนุมัติแล้ว — เจ้าหน้าที่เห็นโครงการนี้แล้ว',
  nonSoftware: 'ระบุว่าไม่ใช่ซอฟต์แวร์แล้ว — นำออกจากรายการรอตรวจสอบ',
};

const REFUSED: Record<Decision, string> = {
  approve: 'อนุมัติไม่สำเร็จ ลองอีกครั้ง',
  nonSoftware: 'บันทึกไม่สำเร็จ ลองอีกครั้ง',
};

/**
 * The held records in the server's urgency order, and decisions applied optimistically: a
 * row goes busy when sent, leaves on success, and comes back with the reason
 * when refused. There is no undo on the API, so the dialog before this is the
 * only safeguard.
 */
export function useApprovalQueue(onChanged: () => void, heldCount?: number): ApprovalQueueState {
  const { items, total, error: loadError, retry } = useHeldData(heldCount);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Readonly<Record<string, LoadError>>>({});
  const [announcement, setAnnouncement] = useState('');

  const entries = useMemo(
    () =>
      items === null
        ? null
        : items
            .filter((record) => !removed.has(record.projectId))
            .map((record) => ({
              record,
              busy: busy.has(record.projectId),
              error: errors[record.projectId] ?? null,
            })),
    [items, removed, busy, errors],
  );

  const decide = useCallback(
    async (record: Procurement, decision: Decision) => {
      const id = record.projectId;
      setBusy((current) => new Set(current).add(id));
      setErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setAnnouncement('');
      try {
        await SEND[decision](id);
        setRemoved((current) => new Set(current).add(id));
        setAnnouncement(DONE[decision]);
        onChanged();
      } catch (caught) {
        setErrors((current) => ({ ...current, [id]: toLoadError(caught, REFUSED[decision]) }));
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [onChanged],
  );

  const decidedButListed = items?.filter((record) => removed.has(record.projectId)).length ?? 0;

  return {
    entries,
    total: Math.max(0, total - decidedButListed),
    loadError,
    retry,
    decide,
    announcement,
  };
}
