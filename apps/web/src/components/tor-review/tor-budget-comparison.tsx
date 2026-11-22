'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BudgetComparison } from '@torfun/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, fetchBudgetComparison } from '@/lib/api';

const baht = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const money = (value: number | null) => (value === null ? '—' : `${baht.format(value)} บาท`);

function position(result: BudgetComparison): string | null {
  if (result.budget === null || result.percentile === null) return null;
  if (result.p25 !== null && result.budget < result.p25) return 'ต่ำกว่าโครงการที่คล้ายกันส่วนใหญ่';
  if (result.p75 !== null && result.budget > result.p75) return 'สูงกว่าโครงการที่คล้ายกันส่วนใหญ่';
  return 'อยู่ในช่วงเดียวกับโครงการที่คล้ายกัน';
}

export function TorBudgetComparison({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<{ projectId: string; data: BudgetComparison } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchBudgetComparison(projectId).then(
      (data) => {
        if (!cancelled) {
          setResult({ projectId, data });
          setError(null);
        }
      },
      (caught) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError && caught.status === 0
              ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ จึงยังเทียบงบประมาณไม่ได้'
              : 'เทียบงบประมาณไม่สำเร็จ',
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const data = result?.projectId === projectId ? result.data : null;
  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="text-base">
          {data && data.peerCount > 0 && position(data)
            ? `งบประมาณ${position(data)}`
            : 'เทียบงบประมาณกับโครงการที่คล้ายกัน'}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          โครงการที่คล้ายกันคือ TOR ที่วิเคราะห์แล้วซึ่งใช้เทคโนโลยีหรือแพลตฟอร์มเดียวกัน (สกัดโดย
          AI) ใช้เป็นแนวทาง ไม่ใช่ราคากลาง
        </p>
      </CardHeader>
      <CardContent>
        {error ? (
          <p role="alert" className="text-muted-foreground text-sm">
            {error}
          </p>
        ) : !data ? (
          <p className="text-muted-foreground text-sm">กำลังเทียบงบประมาณ…</p>
        ) : data.peerCount === 0 ? (
          <p className="text-muted-foreground text-sm">
            ยังไม่มีโครงการที่คล้ายกันพร้อมงบประมาณให้เทียบ
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">งบประมาณโครงการนี้</dt>
                <dd className="font-semibold tabular-nums">{money(data.budget)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ค่ากลาง ({data.peerCount} โครงการ)</dt>
                <dd className="font-semibold tabular-nums">{money(data.median)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ช่วงกลาง (25–75%)</dt>
                <dd className="tabular-nums">
                  {money(data.p25)} – {money(data.p75)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ต่ำสุด – สูงสุด</dt>
                <dd className="tabular-nums">
                  {money(data.min)} – {money(data.max)}
                </dd>
              </div>
            </dl>
            {data.percentile !== null && (
              <p className="text-muted-foreground mt-3 text-sm">
                สูงกว่า {data.percentile}% ของโครงการที่คล้ายกัน
              </p>
            )}
            <ul className="divide-border mt-4 divide-y text-sm">
              {data.peers.map((peer) => (
                <li key={peer.projectId} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link
                    href={`/tor/${encodeURIComponent(peer.projectId)}`}
                    className="hover:text-primary min-w-0 flex-1 underline-offset-4 hover:underline"
                  >
                    {peer.projectName}
                    <span className="text-muted-foreground block text-xs">
                      {peer.deptName} · ใช้ร่วมกัน: {peer.shared.join(', ')}
                    </span>
                  </Link>
                  <span className="tabular-nums">{money(peer.budget)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
