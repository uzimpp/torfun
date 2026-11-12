import Link from 'next/link';
import {
  TOR_REPORT_REASON_LABELS,
  TOR_REPORT_STATUS_LABELS,
  type ReviewTorReport,
  type TorReportResponse,
} from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export function TorReportCard({
  report,
  onReview,
}: {
  report: TorReportResponse;
  onReview: (report: TorReportResponse, action: ReviewTorReport['action']) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={report.status === 'pending' ? 'outline' : 'secondary'}>
            {TOR_REPORT_STATUS_LABELS[report.status]}
          </Badge>
          <time dateTime={report.created_at} className="text-muted-foreground text-xs">
            {dateFormat.format(new Date(report.created_at))}
          </time>
        </div>
        <div>
          <h2 className="leading-relaxed font-semibold">
            <Link
              href={`/tor/${encodeURIComponent(report.project_id)}`}
              className="text-primary hover:underline"
            >
              {report.project_name}
            </Link>
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {report.dept_name} · รหัส {report.project_id}
          </p>
        </div>
        <div className="bg-muted/60 space-y-2 rounded-lg p-4 text-sm">
          <p className="font-medium">{TOR_REPORT_REASON_LABELS[report.reason]}</p>
          {report.details && <p className="wrap-anywhere whitespace-pre-wrap">{report.details}</p>}
        </div>
        <p className="text-muted-foreground text-sm wrap-anywhere">
          ผู้รายงาน: {report.reporter.full_name || report.reporter.username}
          {report.reporter.email ? ` · ${report.reporter.email}` : ` · ${report.reporter.username}`}
        </p>
        {report.review && (
          <div className="space-y-2 border-t pt-4 text-sm">
            <p className="text-muted-foreground wrap-anywhere">
              ตรวจสอบโดย: {report.review.reviewer.full_name || report.review.reviewer.username} ·{' '}
              <time dateTime={report.review.reviewed_at}>
                {dateFormat.format(new Date(report.review.reviewed_at))}
              </time>
            </p>
            {report.review.note && (
              <p className="wrap-anywhere whitespace-pre-wrap">
                บันทึกการตรวจสอบ: {report.review.note}
              </p>
            )}
          </div>
        )}
        {report.status === 'pending' && (
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onReview(report, 'dismiss')}>
              ปิดรายงาน
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => onReview(report, 'remove_tor')}
            >
              นำ TOR ออกจากการเผยแพร่
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
