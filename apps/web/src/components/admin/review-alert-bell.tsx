'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { ReviewAlerts } from '@torfun/types';
import { fetchReviewAlerts } from '@/lib/api';

/** Where a held record is decided: the procurement list filtered to the held. */
export const REVIEW_QUEUE_HREF = '/admin/procurements?outcome=needs_review';

/**
 * The Site Administrator's alert for records the model could not decide
 * (FR-14). Polls like the officer's notification bell, and is quiet while the
 * tab is hidden.
 */
export function ReviewAlertBell() {
  const [alerts, setAlerts] = useState<ReviewAlerts | null>(null);
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const update = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await fetchReviewAlerts();
        if (!cancelled) setAlerts(next);
      } catch {
        /* The queue itself reports connection and session errors when opened. */
      } finally {
        pending = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const waiting = alerts?.waiting ?? 0;
  const newest = alerts?.latest[0];
  return (
    <Link
      href={REVIEW_QUEUE_HREF}
      aria-label={
        waiting > 0 ? `ประกาศรอผู้ดูแลตรวจสอบ ${waiting} รายการ` : 'ไม่มีประกาศรอผู้ดูแลตรวจสอบ'
      }
      title={newest ? `ล่าสุด: ${newest.projectName} · ${newest.deptName}` : undefined}
      className="hover:bg-muted focus-visible:outline-primary relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <ShieldAlert aria-hidden="true" className="size-5" />
      {waiting > 0 && (
        <span
          aria-hidden="true"
          className="bg-destructive absolute top-0 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
        >
          {waiting > 99 ? '99+' : waiting}
        </span>
      )}
    </Link>
  );
}
