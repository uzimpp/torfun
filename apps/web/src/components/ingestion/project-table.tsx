'use client';

import { Fragment, useState } from 'react';
import type { Procurement } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OutcomeLabel, StateBadge } from './status-badge';

function formatThb(amount: number | null): string {
  if (amount === null) return '—';
  return amount.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

/** Status history and retrieved files for one expanded row. */
/**
 * How many documents in the archive actually turned out to be TORs.
 *
 * Not `documents.length`: a candidate that matched the filename pattern but
 * read as a contractor certificate is listed, and must not be counted as a TOR.
 */
/**
 * The reason for the newest status change, where there was one.
 *
 * Read from `statusHistory` rather than a separate `error` field: the history
 * already records it, and two copies would need keeping in step.
 */
function latestDetail(record: Procurement): string | undefined {
  return record.statusHistory.at(-1)?.detail;
}

function countTorDocuments(record: Procurement): number {
  return record.documents.filter(
    (document) => document.role === 'main_tor' || document.role === 'tor_variant',
  ).length;
}

function ProjectDetail({ record }: { record: Procurement }) {
  return (
    <div className="flex flex-col gap-4 p-2">
      <div>
        <h3 className="text-muted-foreground text-xs font-medium">ประวัติสถานะ</h3>
        <ol className="mt-2 flex flex-col gap-1">
          {record.statusHistory.map((change, index) => (
            <li key={`${change.at}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
              <StateBadge state={change.state} />
              <span className="text-muted-foreground">
                {new Date(change.at).toLocaleString('th-TH')}
              </span>
              {change.detail ? <span className="text-destructive">{change.detail}</span> : null}
            </li>
          ))}
        </ol>
      </div>

      {record.documents.length > 0 ? (
        <div>
          <h3 className="text-muted-foreground text-xs font-medium">เอกสารในไฟล์บีบอัด</h3>
          {record.torAmbiguous ? (
            <p className="text-muted-foreground mt-1 text-[10px]">
              พบเอกสารที่อ้างเป็น TOR มากกว่าหนึ่งฉบับ — ระบบเลือกให้ตามแบบแผนชื่อไฟล์ โปรดตรวจสอบ
            </p>
          ) : null}
          <ul className="mt-2 flex flex-col gap-1">
            {record.documents.map((file) => (
              <li key={file.filename} className="flex items-center gap-2 text-xs">
                <span className="font-medium">{file.filename}</span>
                <span className="text-muted-foreground">
                  {(file.bytes / 1024 / 1024).toFixed(1)} MB
                </span>
                {file.role === 'main_tor' ? (
                  <Badge className="text-[10px]">TOR หลัก</Badge>
                ) : null}
                {file.role === 'tor_variant' ? (
                  <Badge variant="secondary" className="text-[10px]">
                    TOR ฉบับอื่น
                  </Badge>
                ) : null}
                {file.role === 'not_tor' ? (
                  <Badge variant="outline" className="text-[10px]">
                    ไม่ใช่ TOR
                  </Badge>
                ) : null}
                {file.role === 'unreadable' ? (
                  <Badge variant="destructive" className="text-[10px]">
                    อ่านไม่ได้
                  </Badge>
                ) : null}
                {file.namePattern === 'loose' ? (
                  <Badge variant="outline" className="text-[10px]">
                    ชื่อไฟล์ไม่ตรงแบบแผน
                  </Badge>
                ) : null}
                {file.note ? (
                  <span className="text-muted-foreground truncate">{file.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {latestDetail(record) ? (
        <p className="text-destructive text-xs">{latestDetail(record)}</p>
      ) : null}
    </div>
  );
}

export function ProjectTable({
  projects,
  total,
  loading,
}: {
  projects: Procurement[];
  total: number;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          ประกาศที่ดึงเข้าระบบ
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {total.toLocaleString('th-TH')} รายการ
          </span>
        </CardTitle>
        <CardDescription>คลิกที่แถวเพื่อดูประวัติสถานะและไฟล์ TOR</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">สถานะ</TableHead>
              <TableHead>โครงการ</TableHead>
              <TableHead className="w-48">หน่วยงาน</TableHead>
              <TableHead className="w-20 text-right">ปี</TableHead>
              <TableHead className="w-36 text-right">งบประมาณ (บาท)</TableHead>
              <TableHead className="w-24 text-right">TOR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  {loading ? 'กำลังโหลด…' : 'ไม่พบรายการที่ตรงกับตัวกรอง'}
                </TableCell>
              </TableRow>
            ) : (
              projects.map((record) => (
                // The key belongs on the fragment: a row and its detail row are
                // one logical item, and React cannot see a key nested inside a
                // bare <>.
                <Fragment key={record.projectId}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() =>
                      setExpanded(expanded === record.projectId ? null : record.projectId)
                    }
                  >
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StateBadge state={record.state} />
                        <OutcomeLabel outcome={record.outcome} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-2 text-sm">{record.projectName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <code className="text-muted-foreground text-xs">{record.projectId}</code>
                        {record.eBidding ? (
                          <Badge variant="outline" className="text-[10px]">
                            e-bidding
                          </Badge>
                        ) : null}
                        {record.softwareClass === 'oandm' ? (
                          <Badge variant="ghost" className="text-[10px]">
                            O&amp;M
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{record.deptName}</TableCell>
                    <TableCell className="text-right tabular-nums">{record.year}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatThb(record.projectMoney)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {countTorDocuments(record) > 0 ? countTorDocuments(record) : '—'}
                    </TableCell>
                  </TableRow>

                  {expanded === record.projectId ? (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/40">
                        <ProjectDetail record={record} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
