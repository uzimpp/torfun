'use client';

import { useEffect, useState } from 'react';
import type { NotificationMatchResponse } from '@torfun/types';
import { fetchTorMatch } from '@/lib/api';
import { notificationError } from './use-inbox-data';

export function MatchEvidence({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<{
    projectId: string;
    data: NotificationMatchResponse;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchTorMatch(projectId).then(
      (data) => {
        if (!cancelled) {
          setResult({ projectId, data });
          setError(null);
        }
      },
      (caught) => {
        if (!cancelled) setError(notificationError(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  const match = result?.projectId === projectId ? result.data.match : null;
  return (
    <div className="bg-muted/50 mt-5 rounded-xl border p-6">
      {error ? (
        <p role="alert" className="text-muted-foreground text-sm">
          {error}
        </p>
      ) : !result ? (
        <p className="text-muted-foreground text-sm">กำลังเทียบกับผลงานบริษัท…</p>
      ) : !match ? (
        <p className="text-muted-foreground text-sm">ไม่มีผลการเทียบผลงานสำหรับบัญชีนี้</p>
      ) : (
        <>
          <p className="text-primary text-4xl font-semibold tabular-nums">
            {Math.round(match.overall_score * 100)}%
            <span className="text-muted-foreground ms-3 text-sm font-normal">
              คะแนนเทียบเทคโนโลยีและแพลตฟอร์ม
            </span>
          </p>
          {match.reasons.length > 0 && (
            <ul className="mt-5 space-y-2 text-sm">
              {match.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            เทคโนโลยี 60% + แพลตฟอร์ม 40% · ข้อมูลที่ไม่มีจะไม่นับเป็นคะแนน
          </p>
          <p className="mt-5 text-sm font-medium">ส่วนที่ยังไม่ตรงหรือยังไม่ได้ตรวจสอบ</p>
          <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
            {match.unmatched.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-5 text-xs">
            ค่าประมาณจากผลงานที่บันทึกและสรุป TOR โดย AI ไม่รับรองคุณสมบัติการยื่นข้อเสนอ
            ตรวจสอบเอกสารต้นฉบับก่อนตัดสินใจ
          </p>
        </>
      )}
    </div>
  );
}
