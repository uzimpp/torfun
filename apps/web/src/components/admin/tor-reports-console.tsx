'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Flag, RefreshCw } from 'lucide-react';
import { TOR_REPORT_REASON_LABELS } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTorReportsData } from './use-tor-reports-data';

const dateFormat = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Bangkok',
});

export function TorReportsConsole() {
  const [offset, setOffset] = useState(0);
  const { data, loading, error, refresh } = useTorReportsData(offset);
  return (
    <main className="page-fill mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">รายงาน TOR จากผู้ใช้</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            รายงานที่รอผู้ดูแลระบบตรวจสอบ การรายงานไม่เปลี่ยนสถานะการเผยแพร่ TOR
          </p>
        </div>
        <Button type="button" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} />
          {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
        </Button>
      </header>
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
                    <Card>
                      <CardContent className="space-y-4 p-5 sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline">รอตรวจสอบ</Badge>
                          <time
                            dateTime={report.created_at}
                            className="text-muted-foreground text-xs"
                          >
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
                          {report.details && (
                            <p className="wrap-anywhere whitespace-pre-wrap">{report.details}</p>
                          )}
                        </div>
                        <p className="text-muted-foreground text-sm wrap-anywhere">
                          ผู้รายงาน: {report.reporter.full_name || report.reporter.username}
                          {report.reporter.email
                            ? ` · ${report.reporter.email}`
                            : ` · ${report.reporter.username}`}
                        </p>
                      </CardContent>
                    </Card>
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
    </main>
  );
}
