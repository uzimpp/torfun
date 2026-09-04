"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { IngestionFailure, IngestionRecord, IngestionState } from "@torfun/types";
import {
  ApiError,
  fetchFailures,
  fetchProjects,
  fetchSummary,
  startIngestionRun,
  type IngestionSummaryResponse,
  type ProjectFilters,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OutcomeLabel, StateBadge } from "./status-badge";
import { SummaryCards } from "./summary-cards";

/**
 * Site Administrator view of the e-GP ingestion queue.
 *
 * Client-rendered because it is an interactive console — filters, polling and a
 * run trigger — rather than a document. Everything it shows comes from the API;
 * no data is duplicated here.
 */

const STATES: IngestionState[] = ["Queued", "Processing", "Completed", "Failed"];
const PAGE_SIZE = 25;

function formatThb(amount: number | null): string {
  if (amount === null) return "—";
  return amount.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

/** Native select, styled to match the Input primitive. */
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function IngestionDashboard() {
  const [summary, setSummary] = useState<IngestionSummaryResponse | null>(null);
  const [projects, setProjects] = useState<IngestionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [failures, setFailures] = useState<IngestionFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [state, setState] = useState("");
  const [agency, setAgency] = useState("");
  const [year, setYear] = useState("");
  const [eBidding, setEBidding] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  /** Bumped to force a reload without changing any filter. */
  const [refreshKey, setRefreshKey] = useState(0);

  // Pure fetch — deliberately free of setState so an effect can call it without
  // triggering the cascading renders the React compiler warns about.
  const loadData = useCallback(() => {
    const filters: ProjectFilters = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      ...(state ? { state: state as IngestionState } : {}),
      ...(agency ? { deptName: agency } : {}),
      ...(year ? { year: Number(year) } : {}),
      ...(eBidding ? { eBidding: eBidding === "true" } : {}),
      ...(query ? { q: query } : {}),
    };
    return Promise.all([fetchSummary(), fetchProjects(filters), fetchFailures()]);
  }, [page, state, agency, year, eBidding, query]);

  useEffect(() => {
    // `cancelled` guards against out-of-order responses: changing a filter
    // twice quickly must not let the slower, older request win.
    let cancelled = false;

    loadData().then(
      ([summaryData, projectData, failureData]) => {
        if (cancelled) return;
        setSummary(summaryData);
        setProjects(projectData.items);
        setTotal(projectData.total);
        setFailures(failureData.items);
        setRunning(summaryData.runInProgress);
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : "เกิดข้อผิดพลาดที่ไม่คาดคิดในการโหลดข้อมูล",
        );
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [loadData, refreshKey]);

  // A run takes minutes, so poll while one is in flight. `runInProgress` comes
  // from the API, so this stops when the run actually ends rather than when the
  // queue momentarily shows nothing Processing.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setRefreshKey((key) => key + 1), 5000);
    return () => clearInterval(timer);
  }, [running]);

  const onRun = async () => {
    setError(null);
    try {
      await startIngestionRun(true);
      setRunning(true);
      setRefreshKey((key) => key + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "ไม่สามารถเริ่มรอบการดึงข้อมูลได้");
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สถานะการดึงข้อมูลประกาศ TOR</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ติดตามสถานะการประมวลผลของประกาศจัดซื้อจัดจ้างที่ดึงจากระบบ e-GP
            {summary?.lastRunAt
              ? ` · รอบล่าสุด ${new Date(summary.lastRunAt).toLocaleString("th-TH")}`
              : null}
          </p>
        </div>
        <Button onClick={() => void onRun()} disabled={running}>
          {running ? "กำลังดึงข้อมูล…" : "เริ่มรอบดึงข้อมูล"}
        </Button>
      </header>

      {error ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">เชื่อมต่อ API ไม่สำเร็จ</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {summary ? <SummaryCards summary={summary} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ตัวกรอง</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="search" className="text-xs text-muted-foreground">
              ค้นหาชื่อโครงการ / รหัส
            </Label>
            <Input
              id="search"
              value={query}
              placeholder="เช่น ระบบสารสนเทศ"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <Select
            label="สถานะ"
            value={state}
            onChange={(value) => {
              setState(value);
              setPage(0);
            }}
            options={[
              { value: "", label: "ทั้งหมด" },
              ...STATES.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Select
            label="หน่วยงาน"
            value={agency}
            onChange={(value) => {
              setAgency(value);
              setPage(0);
            }}
            options={[
              { value: "", label: "ทั้งหมด" },
              ...(summary?.agencies ?? []).map((a) => ({ value: a, label: a })),
            ]}
          />
          <Select
            label="ปีงบประมาณ"
            value={year}
            onChange={(value) => {
              setYear(value);
              setPage(0);
            }}
            options={[
              { value: "", label: "ทั้งหมด" },
              ...(summary?.byYear ?? []).map((y) => ({
                value: String(y.year),
                label: String(y.year),
              })),
            ]}
          />
          <Select
            label="วิธีจัดหา"
            value={eBidding}
            onChange={(value) => {
              setEBidding(value);
              setPage(0);
            }}
            options={[
              { value: "", label: "ทั้งหมด" },
              { value: "true", label: "e-bidding เท่านั้น" },
              { value: "false", label: "ไม่ใช่ e-bidding" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            ประกาศที่ดึงเข้าระบบ
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {total.toLocaleString("th-TH")} รายการ
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    กำลังโหลด…
                  </TableCell>
                </TableRow>
              ) : projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    ไม่พบรายการที่ตรงกับตัวกรอง
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((record) => (
                  // The key belongs on the fragment: a row and its detail row
                  // are one logical item, and React cannot see a key nested
                  // inside a bare <>.
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
                          <code className="text-xs text-muted-foreground">{record.projectId}</code>
                          {record.eBidding ? (
                            <Badge variant="outline" className="text-[10px]">
                              e-bidding
                            </Badge>
                          ) : null}
                          {record.softwareClass === "oandm" ? (
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
                        {record.torFiles.length > 0 ? record.torFiles.length : "—"}
                      </TableCell>
                    </TableRow>

                    {expanded === record.projectId ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          <div className="flex flex-col gap-4 p-2">
                            <div>
                              <h3 className="text-xs font-medium text-muted-foreground">
                                ประวัติสถานะ
                              </h3>
                              <ol className="mt-2 flex flex-col gap-1">
                                {record.statusHistory.map((change, index) => (
                                  <li
                                    key={`${change.at}-${index}`}
                                    className="flex flex-wrap items-center gap-2 text-xs"
                                  >
                                    <StateBadge state={change.state} />
                                    <span className="text-muted-foreground">
                                      {new Date(change.at).toLocaleString("th-TH")}
                                    </span>
                                    {change.detail ? (
                                      <span className="text-destructive">{change.detail}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ol>
                            </div>

                            {record.torFiles.length > 0 ? (
                              <div>
                                <h3 className="text-xs font-medium text-muted-foreground">
                                  ไฟล์ TOR
                                </h3>
                                <ul className="mt-2 flex flex-col gap-1">
                                  {record.torFiles.map((file) => (
                                    <li key={file.filename} className="flex items-center gap-2 text-xs">
                                      <span className="font-medium">{file.filename}</span>
                                      <span className="text-muted-foreground">
                                        {(file.bytes / 1024 / 1024).toFixed(1)} MB
                                      </span>
                                      {file.namePattern === "loose" ? (
                                        <Badge variant="outline" className="text-[10px]">
                                          ชื่อไฟล์ไม่ตรงแบบแผน
                                        </Badge>
                                      ) : null}
                                      {!file.pdfMagicOk ? (
                                        <Badge variant="destructive" className="text-[10px]">
                                          ไม่ใช่ PDF
                                        </Badge>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            {record.error ? (
                              <p className="text-xs text-destructive">{record.error}</p>
                            ) : null}
                          </div>
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          หน้า {page + 1} จาก {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            ก่อนหน้า
          </Button>
          <Button
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            ถัดไป
          </Button>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">บันทึกข้อผิดพลาด</CardTitle>
          <CardDescription>
            รายการที่ดึงเอกสารไม่สำเร็จ สำหรับผู้ดูแลระบบตรวจสอบ
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีข้อผิดพลาด</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {failures.map((failure, index) => (
                <li key={`${failure.projectId}-${index}`} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive" className="text-[10px]">
                      {failure.stage}
                    </Badge>
                    <code className="text-xs">{failure.projectId}</code>
                    <span className="text-xs text-muted-foreground">
                      {new Date(failure.at).toLocaleString("th-TH")}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-sm">{failure.projectName}</p>
                  <p className="text-xs text-destructive">{failure.error}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
