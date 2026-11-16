import Link from 'next/link';
import type { QualificationMatchResult, TorQualification } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const statusLabels = {
  met: 'ตรงเงื่อนไข',
  not_met: 'ไม่ตรงเงื่อนไข',
  unknown: 'ยังสรุปไม่ได้',
};

export function TorQualificationResults({
  qualifications,
  result,
}: {
  qualifications?: TorQualification[];
  result?: QualificationMatchResult | null;
}) {
  const score = result?.overallScore;
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">
          {score == null
            ? 'ยังไม่มีคะแนนคุณสมบัติ'
            : `คะแนนคุณสมบัติโดยประมาณ ${Math.round(score * 100)}%`}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          AI อ่านคุณสมบัติจาก TOR ระบบเทียบกับข้อมูลที่บริษัทบันทึกไว้
          โปรดตรวจเงื่อนไขในเอกสารต้นฉบับก่อนตัดสินใจยื่นข้อเสนอ
        </p>
        {result && (
          <p className="text-muted-foreground text-sm">
            คะแนนคิดจากสัดส่วนข้อที่ตรงเงื่อนไขต่อข้อที่สกัดได้ทั้งหมด
          </p>
        )}
      </CardHeader>
      <CardContent>
        {qualifications === undefined && (
          <p className="text-muted-foreground text-sm">ยังไม่มีผลการสกัดคุณสมบัติแบบแยกรายข้อ</p>
        )}
        {qualifications?.length === 0 && (
          <p className="text-muted-foreground text-sm">AI ยังไม่พบข้อกำหนดคุณสมบัติในเอกสารนี้</p>
        )}
        {!!qualifications?.length && (
          <ul className="divide-border divide-y">
            {qualifications.map((item, index) => {
              const check = result?.checks[index];
              return (
                <li
                  key={`${item.source}-${index}`}
                  className="grid gap-2 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={check?.status === 'not_met' ? 'destructive' : 'outline'}>
                      {statusLabels[check?.status ?? 'unknown']}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      อ้างอิง TOR · {item.source}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{item.text}</p>
                  {!!check?.evidence.length && (
                    <ul className="text-muted-foreground list-disc space-y-1 ps-5 text-sm">
                      {check.evidence.map((line, lineIndex) => (
                        <li key={lineIndex}>{line}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {qualifications && qualifications.length > 0 && (
          <Link
            className="text-primary mt-5 inline-block text-sm underline underline-offset-4"
            href="/company"
          >
            ดูข้อมูลบริษัทที่ใช้เปรียบเทียบ
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
