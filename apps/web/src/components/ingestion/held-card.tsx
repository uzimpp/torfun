'use client';

import Link from 'next/link';
import { useState } from 'react';
import { HOLD_REASON_LABELS, type Procurement } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TorDownloadButton } from '@/components/tor-review/tor-download-button';
import { ProjectActionDialog, type ProjectAction } from './project-action-dialog';
import { HELD_LIMIT, useHeldData } from './use-held-data';

/**
 * The records the pipeline would not decide on its own — the model was unsure,
 * or could not read the whole document — waiting for a person. Officers never
 * see them. Each row carries what the model said and the source to check it
 * against, since the model's reading is a summary and not an authority.
 */
export function HeldCard({
  reloadKey,
  onChanged,
}: {
  /** Changes when something elsewhere may have moved a record in or out of this list. */
  reloadKey: number;
  /** Called after an action here went through, so the rest of the console can reload. */
  onChanged: () => void;
}) {
  const { items, total, error, sessionEnded, retry } = useHeldData(reloadKey);
  const [acting, setActing] = useState<{ record: Procurement; action: ProjectAction } | null>(null);

  return (
    <Card id="held" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          รอตรวจสอบ
          {total > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {total}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          โครงการที่ AI ไม่มั่นใจหรืออ่านเอกสารได้ไม่ครบ เจ้าหน้าที่ยังไม่เห็นจนกว่าจะอนุมัติ
          ตรวจกับเอกสารต้นฉบับก่อนตัดสิน
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p className="text-destructive text-sm">{error}</p>
            {sessionEnded ? (
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
              >
                เข้าสู่ระบบอีกครั้ง
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={retry}>
                ลองอีกครั้ง
              </Button>
            )}
          </div>
        ) : items === null ? (
          <p role="status" aria-busy="true" className="text-muted-foreground text-sm">
            กำลังโหลด…
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">ไม่มีโครงการที่รอตรวจสอบ</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y">
              {items.map((record) => (
                <li
                  key={record.projectId}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/tor/${record.projectId}`}
                      className="text-sm font-medium break-words hover:underline"
                    >
                      {record.projectName}
                    </Link>
                    <p className="text-sm">
                      {record.holdReason ? HOLD_REASON_LABELS[record.holdReason] : null}
                    </p>
                    {record.analysis?.reason ? (
                      <p className="text-muted-foreground text-xs">
                        เหตุผลจาก AI: {record.analysis.reason}
                      </p>
                    ) : null}
                    <code className="text-muted-foreground text-xs">{record.projectId}</code>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <TorDownloadButton projectId={record.projectId} size="sm" />
                    <Button size="sm" onClick={() => setActing({ record, action: 'approve' })}>
                      อนุมัติ
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActing({ record, action: 'nonSoftware' })}
                    >
                      ระบุว่าไม่ใช่ซอฟต์แวร์
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {total > items.length ? (
              <p className="text-muted-foreground text-xs">
                แสดง {HELD_LIMIT} รายการแรกจาก {total} รายการ
              </p>
            ) : null}
          </>
        )}
      </CardContent>

      {acting ? (
        <ProjectActionDialog
          record={acting.record}
          action={acting.action}
          onClose={() => setActing(null)}
          onDone={onChanged}
        />
      ) : null}
    </Card>
  );
}
