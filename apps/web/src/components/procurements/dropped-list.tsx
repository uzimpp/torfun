'use client';

import { useState } from 'react';
import { ArchiveX, ListX, RefreshCw } from 'lucide-react';
import { TOMBSTONE_REASON_LABELS, type Tombstone } from '@torfun/types';
import { AdminLoadError } from '@/components/admin/admin-load-error';
import { EmptyState } from '@/components/admin/admin-ui';
import { LoadingRegion } from '@/components/admin/loading-region';
import {
  TombstoneActionDialog,
  type TombstoneAction,
} from '@/components/ingestion/tombstone-action-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatThaiDate } from '@/lib/format-date';
import type { DroppedState } from './use-dropped-list';

/**
 * Projects dropped as not software work, by the model or an administrator, with
 * why, who decided and the passage that decided it. Two ways back when the call
 * was wrong: remove the tombstone (nothing is downloaded now) or restore it
 * (one fresh read, which downloads from the upstream site).
 */
export function DroppedList({ dropped }: { dropped: DroppedState }) {
  const { items, error, reload } = dropped;
  const [queuedNote, setQueuedNote] = useState(false);
  const [acting, setActing] = useState<{ tombstone: Tombstone; action: TombstoneAction } | null>(
    null,
  );

  const done = (action: TombstoneAction) => {
    setQueuedNote(action === 'restore');
    reload();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground max-w-prose text-sm">
        โครงการที่ถูกคัดออกว่าไม่ใช่งานซอฟต์แวร์ ตรวจเหตุผลได้ที่นี่ และนำกลับมาได้หากเห็นว่าผิด
      </p>
      {queuedNote ? (
        <p role="status" className="text-sm">
          จัดคิวอ่านใหม่แล้ว โครงการอยู่ในคิวรอประมวลผล
        </p>
      ) : null}

      {error ? (
        <AdminLoadError error={error} onRetry={reload} />
      ) : items === null ? (
        <LoadingRegion className="bg-card divide-y rounded-lg border">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 px-4 py-4">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
          ))}
        </LoadingRegion>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ArchiveX}
          title="ยังไม่มีโครงการที่ถูกคัดออก"
          hint="เมื่อ AI หรือผู้ดูแลระบบคัดโครงการออก รายการจะแสดงที่นี่"
          className="bg-card rounded-lg border"
        />
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {items.map((item) => (
            <li
              key={item.projectId}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                  <span className="text-foreground font-mono">{item.projectId}</span>
                  <span>{formatThaiDate(item.decidedAt, { withTime: true })}</span>
                </p>
                <p className="text-sm break-words">
                  {TOMBSTONE_REASON_LABELS[item.reason]}
                  {item.decidedBy ? (
                    <span className="text-muted-foreground"> · โดย {item.decidedBy}</span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs break-words">“{item.evidence}”</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActing({ tombstone: item, action: 'remove' })}
                >
                  <ListX className="size-4" aria-hidden="true" />
                  ลบออกจากรายการ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActing({ tombstone: item, action: 'restore' })}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  ดึงข้อมูลใหม่
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {acting ? (
        <TombstoneActionDialog
          tombstone={acting.tombstone}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={done}
        />
      ) : null}
    </div>
  );
}
