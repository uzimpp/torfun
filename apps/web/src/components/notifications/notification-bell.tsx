'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { fetchNotifications } from '@/lib/api';

export function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const update = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const inbox = await fetchNotifications('unread');
        if (!cancelled) setCount(inbox.unread_count);
      } catch {
        /* The inbox displays connection/session errors when opened. */
      } finally {
        pending = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 30000);
    document.addEventListener('visibilitychange', update);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `การแจ้งเตือน · ยังไม่อ่าน ${count} รายการ` : 'การแจ้งเตือน'}
      className="hover:bg-muted focus-visible:outline-primary relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Bell aria-hidden="true" className="size-5" />
      {count > 0 && (
        <span
          className="bg-primary text-primary-foreground absolute top-0 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
          aria-label={`ยังไม่อ่าน ${count} รายการ`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
