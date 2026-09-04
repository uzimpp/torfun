import type { IngestionSummaryResponse } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Formats bytes at whatever magnitude keeps the number readable. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function SummaryCards({ summary }: { summary: IngestionSummaryResponse }) {
  const tiles = [
    {
      label: "ประกาศทั้งหมด",
      value: summary.total.toLocaleString("th-TH"),
      hint: "ไม่ซ้ำตามรหัสโครงการ",
    },
    {
      label: "รอดำเนินการ",
      value: (summary.byState.Queued ?? 0).toLocaleString("th-TH"),
      hint: "ยังไม่ได้ดึงเอกสาร",
    },
    {
      label: "สำเร็จ",
      value: (summary.byState.Completed ?? 0).toLocaleString("th-TH"),
      hint: `ได้ไฟล์ TOR ${summary.torFilesRetrieved} ไฟล์ · ${formatBytes(summary.totalTorBytes)}`,
    },
    {
      label: "ล้มเหลว",
      value: (summary.byState.Failed ?? 0).toLocaleString("th-TH"),
      hint: `บันทึกข้อผิดพลาด ${summary.failureCount} รายการ`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardHeader className="pb-2">
            <CardDescription>{tile.label}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{tile.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{tile.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
