'use client';

import { useEffect, useState } from 'react';
import {
  fetchNotificationFailures,
  retryNotificationDelivery,
  type NotificationFailure,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { notificationError } from './use-inbox-data';

function useDeliveryLog() {
  const [rows, setRows] = useState<NotificationFailure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchNotificationFailures();
        if (!cancelled) {
          setRows(data);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(notificationError(caught));
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [version]);
  return { rows, error, reload: () => setVersion((value) => value + 1) };
}

export function DeliveryLog() {
  const { rows, error, reload } = useDeliveryLog();
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const retry = async (id: string) => {
    setPending(id);
    setActionError(null);
    try {
      await retryNotificationDelivery(id);
      reload();
    } catch (caught) {
      setActionError(notificationError(caught));
    } finally {
      setPending(null);
    }
  };
  return (
    <section className="mt-8" aria-label="การส่งที่ต้องตรวจสอบ">
      <Button variant="outline" onClick={reload}>
        รีเฟรชรายการ
      </Button>
      {(error || actionError) && (
        <p role="alert" className="text-destructive mt-4">
          {actionError ?? error}
        </p>
      )}
      {!rows && !error && <p className="text-muted-foreground mt-6">กำลังโหลดรายการ…</p>}
      {rows?.length === 0 && (
        <p className="text-muted-foreground mt-6 rounded-xl border border-dashed p-8">
          ไม่มีการส่งที่รอลองใหม่หรือล้มเหลว
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="mt-5 divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-medium">
                  {row.channel === 'line' ? 'LINE' : 'อีเมล'} ·{' '}
                  {row.state === 'retry' ? 'รอลองใหม่' : 'ส่งไม่สำเร็จ'}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {row.error} · ลองแล้ว {row.attempts} ครั้ง
                </p>
                <time
                  className="text-muted-foreground mt-2 block text-xs"
                  dateTime={row.created_at}
                >
                  {new Date(row.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                </time>
              </div>
              {row.state === 'failed' && (
                <Button
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => void retry(row.id)}
                >
                  ลองใหม่<span className="sr-only"> {row.id}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
