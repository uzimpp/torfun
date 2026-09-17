import type { IngestionSummaryResponse } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Formats bytes at whatever magnitude keeps the number readable. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function SummaryCards({ summary }: { summary: IngestionSummaryResponse }) {
  const failed = summary.byState.Failed ?? 0;
  const tiles = [
    {
      label: 'ประกาศทั้งหมด',
      value: summary.total.toLocaleString('th-TH'),
      hint: 'ไม่ซ้ำตามรหัสโครงการ',
      alert: false,
    },
    {
      label: 'รอดำเนินการ',
      value: (summary.byState.Queued ?? 0).toLocaleString('th-TH'),
      hint: 'ยังไม่ได้ดึงเอกสาร',
      alert: false,
    },
    {
      label: 'สำเร็จ',
      value: (summary.byState.Completed ?? 0).toLocaleString('th-TH'),
      hint: `ได้ไฟล์ TOR ${summary.torDocumentsRetrieved} ไฟล์ · ${formatBytes(summary.totalTorBytes)}`,
      alert: false,
    },
    {
      label: 'ล้มเหลว',
      value: failed.toLocaleString('th-TH'),
      hint: `บันทึกข้อผิดพลาด ${summary.failureCount} รายการ`,
      // Only a problem when there is one — an all-zero column stays neutral.
      alert: failed > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} className={cn(tile.alert && 'border-destructive/40')}>
          <CardHeader className="pb-2">
            <CardDescription>{tile.label}</CardDescription>
            <CardTitle
              className={cn('text-3xl tabular-nums', tile.alert && 'text-destructive')}
            >
              {tile.value}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">{tile.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
