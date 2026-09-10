import type { IngestionFailure } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The retrieval failures an administrator reviews. `id="failures"` is the
 * anchor the account menu's "บันทึกข้อผิดพลาด" row jumps to; `scroll-mt` keeps
 * it clear of the sticky header when it does. When there is something to
 * review the card takes a destructive edge so it reads as the thing to look at.
 */
export function FailureLog({ failures }: { failures: IngestionFailure[] }) {
  const hasFailures = failures.length > 0;

  return (
    <Card
      id="failures"
      className={cn('scroll-mt-24', hasFailures && 'border-destructive/40')}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          บันทึกข้อผิดพลาด
          {hasFailures ? (
            <Badge variant="destructive" className="tabular-nums">
              {failures.length}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>รายการที่ดึงเอกสารไม่สำเร็จ สำหรับผู้ดูแลระบบตรวจสอบ</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasFailures ? (
          <p className="text-muted-foreground text-sm">ไม่มีข้อผิดพลาด</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {failures.map((failure, index) => (
              <li key={`${failure.projectId}-${index}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive" className="text-[10px]">
                    {failure.stage}
                  </Badge>
                  <code className="text-xs">{failure.projectId}</code>
                  <span className="text-muted-foreground text-xs">
                    {new Date(failure.at).toLocaleString('th-TH')}
                  </span>
                </div>
                <p className="line-clamp-1 text-sm">{failure.projectName}</p>
                <p className="text-destructive text-xs">{failure.error}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
