import type { IngestionFailure } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function FailureLog({ failures }: { failures: IngestionFailure[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">บันทึกข้อผิดพลาด</CardTitle>
        <CardDescription>รายการที่ดึงเอกสารไม่สำเร็จ สำหรับผู้ดูแลระบบตรวจสอบ</CardDescription>
      </CardHeader>
      <CardContent>
        {failures.length === 0 ? (
          <p className="text-muted-foreground text-sm">ไม่มีข้อผิดพลาด</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {failures.map((failure, index) => (
              <li key={`${failure.projectId}-${index}`} className="flex flex-col gap-1">
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
