'use client';

import { useState } from 'react';
import Link from 'next/link';
import { linkNotificationLine } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { notificationError } from './use-inbox-data';

export function LinkLine({ linkToken }: { linkToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await linkNotificationLine(linkToken);
      if (new URL(url).origin !== 'https://access.line.me')
        throw new Error('ลิงก์เชื่อมต่อไม่ถูกต้อง');
      window.location.assign(url);
    } catch (caught) {
      setError(notificationError(caught));
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 space-y-5">
      <p className="text-muted-foreground leading-relaxed">
        เชื่อมต่อเฉพาะบัญชี LINE ของคุณเอง เปิดลิงก์จากแชต Torfun เท่านั้น
        เมื่อยืนยันแล้วให้กลับมาเลือกประเภทการแจ้งเตือน คุณสามารถยกเลิกการเชื่อมต่อได้ทุกเมื่อ
      </p>
      <Button disabled={busy || !linkToken} onClick={() => void connect()}>
        {busy ? 'กำลังเชื่อมต่อ…' : 'ยืนยันเชื่อมต่อบัญชี LINE ของฉัน'}
      </Button>
      {!linkToken && (
        <p role="alert">ลิงก์ไม่ครบถ้วน กรุณาพิมพ์ “เชื่อมต่อ” ในแชต Torfun เพื่อรับลิงก์ใหม่</p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Link
        href="/notifications"
        className="text-primary block min-h-11 py-3 text-sm underline underline-offset-4"
      >
        กลับไปการแจ้งเตือน
      </Link>
    </div>
  );
}
