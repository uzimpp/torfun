'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TOMBSTONE_REASON_LABELS, type Tombstone } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, SessionEndedError } from '@/lib/api';
import { fetchTombstones } from '@/lib/api-tombstones';
import { cn } from '@/lib/utils';
import { TombstoneActionDialog, type TombstoneAction } from './tombstone-action-dialog';
import { SESSION_ENDED_MESSAGE } from './use-ingestion-data';

/**
 * The projects dropped as not software work, by the model or by an
 * administrator. They are not shown to officers, but an AI's reading is a summary
 * and never an authority, so each is kept here with why it went, who decided,
 * and the passage that decided it — enough for a person to check. Two ways back
 * when the call was wrong: remove the tombstone (the project may return on a
 * later sweep, nothing downloaded now) or restore it (one fresh read, which
 * downloads from the upstream site).
 */
export function DroppedCard({
  reloadKey,
  onChanged,
}: {
  /** Changes when something elsewhere may have added or removed an entry. */
  reloadKey: number;
  /** Called after an action here went through, so the rest of the console can reload. */
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Tombstone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [queuedNote, setQueuedNote] = useState(false);
  const [acting, setActing] = useState<{ tombstone: Tombstone; action: TombstoneAction } | null>(
    null,
  );
  /** Bumped to read again after a failure. */
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchTombstones().then(
      (loaded) => {
        if (cancelled) return;
        setItems(loaded);
        setError(null);
        setSessionEnded(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setSessionEnded(caught instanceof SessionEndedError);
        setError(
          caught instanceof SessionEndedError
            ? SESSION_ENDED_MESSAGE
            : caught instanceof ApiError && caught.status !== 0
              ? 'ไม่สามารถโหลดรายการที่ถูกคัดออกได้'
              : 'ไม่สามารถโหลดรายการที่ถูกคัดออกได้ (เชื่อมต่อ API ไม่สำเร็จ)',
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloadKey]);

  const done = (action: TombstoneAction) => {
    setQueuedNote(action === 'restore');
    setRefreshKey((key) => key + 1);
    onChanged();
  };

  return (
    <Card id="dropped" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          ถูกคัดออก
          {items && items.length > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {items.length}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          โครงการที่ถูกคัดออกว่าไม่ใช่งานซอฟต์แวร์ (Non-software) ตรวจสอบเหตุผลได้ที่นี่
          และนำกลับมาได้หากเห็นว่าผิด
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {queuedNote ? (
          <p role="status" className="text-sm">
            จัดคิวอ่านใหม่แล้ว โครงการอยู่ในคิวรอประมวลผล
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-center gap-3">
            <p className="text-destructive text-sm">{error}</p>
            {sessionEnded ? (
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                เข้าสู่ระบบอีกครั้ง
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>
                ลองอีกครั้ง
              </Button>
            )}
          </div>
        ) : items === null ? (
          <p role="status" aria-busy="true" className="text-muted-foreground text-sm">
            กำลังโหลด…
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">ยังไม่มีโครงการที่ถูกคัดออก</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {items.map((item) => (
              <li
                key={item.projectId}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-xs">{item.projectId}</code>
                    <span className="text-muted-foreground text-xs">
                      {new Date(item.decidedAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  <p className="text-sm">
                    {TOMBSTONE_REASON_LABELS[item.reason]}
                    {item.decidedBy ? (
                      <span className="text-muted-foreground"> · โดย {item.decidedBy}</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">“{item.evidence}”</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActing({ tombstone: item, action: 'remove' })}
                  >
                    ลบออกจากรายการ
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActing({ tombstone: item, action: 'restore' })}
                  >
                    ดึงข้อมูลใหม่
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {acting ? (
        <TombstoneActionDialog
          tombstone={acting.tombstone}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={done}
        />
      ) : null}
    </Card>
  );
}
