'use client';

import { useEffect, useState } from 'react';
import type { ReviewTorReport, TorReportFilter, TorReportListResponse } from '@torfun/types';
import { ApiError, fetchTorReports, reviewTorReport } from '@/lib/api';

export function useTorReportsData(offset: number, status: TorReportFilter) {
  const [revision, setRevision] = useState(0);
  const requestKey = `${status}:${offset}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data: TorReportListResponse | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTorReports(offset, controller.signal, status)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, data, error: null });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          data: null,
          error:
            caught instanceof ApiError && caught.status === 0
              ? 'เชื่อมต่อ API ไม่สำเร็จ กรุณาลองอีกครั้ง'
              : 'โหลดรายงาน TOR ไม่สำเร็จ กรุณาลองอีกครั้ง',
        });
      });
    return () => controller.abort();
  }, [offset, requestKey, status]);

  const current = result?.key === requestKey ? result : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    refresh: () => setRevision((value) => value + 1),
    reviewReport: async (id: string, input: ReviewTorReport) => {
      try {
        const report = await reviewTorReport(id, input);
        setRevision((value) => value + 1);
        return report;
      } catch (error) {
        // An administrator may have acted since this page was loaded.
        if (error instanceof ApiError && (error.status === 409 || error.status === 404)) {
          setRevision((value) => value + 1);
        }
        throw error;
      }
    },
  };
}
