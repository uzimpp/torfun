'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Flag, RefreshCw, X } from 'lucide-react';
import {
  TOR_REPORT_STATUS_LABELS,
  type ReviewTorReport,
  type TorReportFilter,
  type TorReportResponse,
} from '@torfun/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTorReportsData } from './use-tor-reports-data';
import { TorReportCard } from './tor-report-card';
import { TorReportReviewDialog } from './tor-report-review-dialog';

export function TorReportsConsole() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<TorReportFilter>('pending');
  const [selection, setSelection] = useState<{
    report: TorReportResponse;
    action: ReviewTorReport['action'];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data, loading, error, refresh, reviewReport } = useTorReportsData(offset, status);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  async function confirm(input: ReviewTorReport) {
    if (!selection) return;
    await reviewReport(selection.report.id, input);
    setSelection(null);
    setOffset(0);
    setMessage(
      input.action === 'dismiss'
        ? 'ปิดรายงานแล้ว การเผยแพร่ TOR ไม่เปลี่ยนแปลง'
        : 'นำ TOR ออกจากการเผยแพร่แล้ว',
    );
  }

  return (
    <main className="page-fill mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">รายงาน TOR จากผู้ใช้</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            ตรวจสอบรายงาน ปิดรายงาน หรือนำ TOR ออกจากการเผยแพร่ พร้อมประวัติการตัดสินใจ
          </p>
        </div>
        <Button type="button" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} />
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="report-status" className="text-sm font-medium">
          สถานะรายงาน
        </label>
        <select
          id="report-status"
          value={status}
          disabled={loading}
          onChange={(event) => {
            setStatus(event.target.value as TorReportFilter);
            setOffset(0);
          }}
          className="bg-background rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {Object.entries(TOR_REPORT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          <option value="all">ทั้งหมด</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="text-destructive rounded-xl border p-4 text-sm">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-muted-foreground py-8 text-sm">
          กำลังโหลดรายงาน TOR…
        </p>
      ) : (
        !error &&
        data && (
          <>
            <p className="text-muted-foreground text-sm">ทั้งหมด {data.total} รายงาน</p>
            {data.items.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                  <Flag aria-hidden="true" className="text-muted-foreground size-8" />
                  <p>ยังไม่มีรายงาน TOR ในหน้านี้</p>
                  <p className="text-muted-foreground text-sm">
                    รายงานที่ผู้ใช้ส่งจะแสดงให้ผู้ดูแลระบบทุกคนเห็นที่นี่
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul className="space-y-4">
                {data.items.map((report) => (
                  <li key={report.id}>
                    <TorReportCard
                      report={report}
                      onReview={(target, action) => setSelection({ report: target, action })}
                    />
                  </li>
                ))}
              </ul>
            )}
            <nav aria-label="หน้ารายงาน TOR" className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                หน้า {Math.floor(offset / 25) + 1} จาก {Math.max(1, Math.ceil(data.total / 25))}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 25))}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + 25 >= data.total}
                  onClick={() => setOffset(offset + 25)}
                >
                  ถัดไป
                </Button>
              </div>
            </nav>
          </>
        )
      )}
      {selection && (
        <TorReportReviewDialog
          key={`${selection.report.id}-${selection.action}`}
          report={selection.report}
          action={selection.action}
          onCancel={() => setSelection(null)}
          onConfirm={confirm}
        />
      )}
      <div role="status" aria-atomic="true">
        {message && (
          <div className="bg-popover fixed right-4 bottom-4 z-50 flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-xl border p-4 shadow-lg">
            <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-emerald-600" />
            <p className="text-sm">{message}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="ปิดข้อความแจ้งเตือน"
              onClick={() => setMessage(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
