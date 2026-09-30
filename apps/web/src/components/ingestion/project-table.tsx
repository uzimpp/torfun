'use client';

import { Fragment, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { STATUS_LABELS, type Procurement } from '@torfun/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { attemptsLabel, describeChange, stageDuration } from './status-tracking';
import { OutcomeLabel, StateBadge } from './status-badge';

const COLUMNS = 8;

function formatThb(amount: number | null): string {
  if (amount === null) return '—';
  return amount.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

/**
 * The reason for the newest status change, where there was one.
 *
 * Read from `statusHistory` rather than a separate `error` field: the history
 * already records it, and two copies would need keeping in step.
 */
function latestDetail(record: Procurement): string | undefined {
  return record.statusHistory.at(-1)?.detail;
}

/**
 * How many documents in the archive actually turned out to be TORs.
 *
 * Not `documents.length`: a candidate that matched the filename pattern but
 * read as a contractor certificate is listed, and must not be counted as a TOR.
 */
function countTorDocuments(record: Procurement): number {
  return record.documents.filter(
    (document) => document.role === 'main_tor' || document.role === 'tor_variant',
  ).length;
}

/** Status history and retrieved files for one expanded row. */
function ProjectDetail({ record }: { record: Procurement }) {
  return (
    <div className="flex flex-col gap-4 p-2">
      <div>
        <h3 className="text-muted-foreground text-xs font-medium">ประวัติสถานะ</h3>
        <ol aria-label="ประวัติสถานะ" className="mt-2 flex flex-col gap-1.5">
          {record.statusHistory.map((change, index) => {
            const described = describeChange(change);
            return (
              <li
                key={`${change.at}-${index}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
              >
                <StateBadge state={change.state} />
                <span>{described.outcome}</span>
                <span className="text-muted-foreground">{described.time}</span>
                {described.detail ? (
                  <span className="text-destructive">{described.detail}</span>
                ) : null}
              </li>
            );
          })}
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
              <li key={file.filename} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">{file.filename}</span>
                <span className="text-muted-foreground">
                  {(file.bytes / 1024 / 1024).toFixed(1)} MB
                </span>
                {file.role === 'main_tor' ? <Badge className="text-[10px]">TOR หลัก</Badge> : null}
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

/** Placeholder rows the height of real ones, so the table does not jump when data arrives. */
function SkeletonRows() {
  return Array.from({ length: 5 }, (_, row) => (
    <TableRow key={row} aria-hidden="true">
      {Array.from({ length: COLUMNS }, (_, cell) => (
        <TableCell key={cell}>
          <div
            className={cn(
              'bg-muted h-4 rounded motion-safe:animate-pulse',
              cell === 3 ? 'w-full' : 'w-3/4',
            )}
          />
        </TableCell>
      ))}
    </TableRow>
  ));
}

export function ProjectTable({
  projects,
  total,
  loading,
  now,
  onClearFilters,
}: {
  projects: Procurement[];
  total: number;
  loading: boolean;
  /** The moment "in this stage for N minutes" is measured to. */
  now: Date;
  onClearFilters: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (projectId: string) => setExpanded(expanded === projectId ? null : projectId);

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
        <Table aria-busy={loading}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">สถานะการประมวลผล</TableHead>
              <TableHead className="w-56">ผลการประมวลผล</TableHead>
              <TableHead className="w-44">สถานะโครงการ</TableHead>
              <TableHead className="min-w-64">โครงการ</TableHead>
              <TableHead className="w-48">หน่วยงาน</TableHead>
              <TableHead className="w-20 text-right">ปี</TableHead>
              <TableHead className="w-36 text-right">งบประมาณ (บาท)</TableHead>
              <TableHead className="w-20 text-right">TOR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonRows />
            ) : projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="py-12">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-muted-foreground">ไม่พบรายการที่ตรงกับตัวกรอง</p>
                    <Button variant="outline" onClick={onClearFilters}>
                      ล้างตัวกรอง
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              projects.map((record) => {
                const duration = stageDuration(record, now);
                const attempts = attemptsLabel(record.attempts);
                const isOpen = expanded === record.projectId;
                return (
                  // The key belongs on the fragment: a row and its detail row are
                  // one logical item, and React cannot see a key nested inside a
                  // bare <>.
                  <Fragment key={record.projectId}>
                    <TableRow className="cursor-pointer" onClick={() => toggle(record.projectId)}>
                      <TableCell>
                        <StateBadge state={record.state} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <OutcomeLabel outcome={record.outcome} />
                          {duration ? (
                            <span className="text-muted-foreground text-xs">{duration.label}</span>
                          ) : null}
                          {duration?.overdue ? (
                            <span className="text-destructive inline-flex items-center gap-1 text-xs font-medium">
                              <AlertTriangle className="size-3.5" aria-hidden="true" />
                              นานกว่าปกติ
                            </span>
                          ) : null}
                          {attempts ? (
                            <span className="text-muted-foreground text-xs">{attempts}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm">{STATUS_LABELS[record.status]}</span>
                          {record.statusSource === 'ai' ? (
                            <Badge variant="outline" className="w-fit text-[10px]">
                              AI ประเมิน
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`detail-${record.projectId}`}
                          className="focus-visible:ring-ring/50 flex w-full items-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-[3px]"
                        >
                          <span className="line-clamp-2 text-sm">{record.projectName}</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              'text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform motion-reduce:transition-none',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
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

                    {isOpen ? (
                      <TableRow id={`detail-${record.projectId}`}>
                        <TableCell colSpan={COLUMNS} className="bg-muted/40">
                          <ProjectDetail record={record} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
