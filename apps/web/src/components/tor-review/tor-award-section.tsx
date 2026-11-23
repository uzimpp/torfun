'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { TorAwardSummary } from './tor-award-summary';
import { useTorAward } from './use-tor-award';

/**
 * Who won and at what price (#142) on the detail page. Shown only for contract
 * lines carrying exactly this procurement's project id (`awardFor`); with none,
 * the empty state of `TorAwardSummary` says so. A failed load is its own message
 * and never hides or changes the rest of the page.
 */
export function TorAwardSection({ projectId }: { projectId: string }) {
  const state = useTorAward(projectId);

  if (state.status === 'loading') {
    return (
      <p role="status" className="text-muted-foreground mt-5 text-sm">
        กำลังโหลดข้อมูลผู้ชนะและราคา
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">โหลดข้อมูลผู้ชนะและราคาไม่สำเร็จ</CardTitle>
          <p className="text-muted-foreground text-sm">
            ส่วนอื่นของหน้านี้ไม่ได้รับผลกระทบ ลองโหลดหน้าใหม่อีกครั้ง
          </p>
        </CardHeader>
      </Card>
    );
  }
  return <TorAwardSummary award={state.award} />;
}
