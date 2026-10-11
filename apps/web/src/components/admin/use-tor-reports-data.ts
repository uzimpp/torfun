'use client';

import { useEffect, useState } from 'react';
import type { TorReportListResponse } from '@torfun/types';
import { ApiError, fetchTorReports } from '@/lib/api';

export function useTorReportsData(offset: number) {
  const [revision, setRevision] = useState(0);
  const requestKey = `${offset}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data: TorReportListResponse | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTorReports(offset, controller.signal)
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
  }, [offset, requestKey]);

  const current = result?.key === requestKey ? result : null;
  return {
    data: current?.data ?? null,
    loading: current === null,
    error: current?.error ?? null,
    refresh: () => setRevision((value) => value + 1),
  };
}
