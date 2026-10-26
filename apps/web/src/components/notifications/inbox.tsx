'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CheckCheck, Inbox as InboxIcon, RefreshCw } from 'lucide-react';
import { readAllNotifications, updateNotification, verifyNotificationEmail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { NotificationItem } from './notification-item';
import { NotificationPreferencesPanel } from './notification-preferences';
import { notificationError, useInboxData } from './use-inbox-data';

export function Inbox({ verificationToken }: { verificationToken?: string }) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const { data, settings, error: loadError, reload } = useInboxData(filter, page);
  const act = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNotice(message);
      reload();
    } catch (caught) {
      setError(notificationError(caught));
    } finally {
      setBusy(false);
    }
  };
  const update = (id: string, action: 'read' | 'dismiss') => {
    void act(
      async () => {
        await updateNotification(id, action);
        if (data?.items.length === 1 && page > 0 && (action === 'dismiss' || filter === 'unread'))
          setPage((value) => value - 1);
      },
      action === 'read' ? 'ทำเครื่องหมายว่าอ่านแล้ว' : 'ซ่อนการแจ้งเตือนแล้ว',
    );
  };
  return (
    <main className="page-fill mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-primary flex items-center gap-2 text-xs font-medium">
            <Bell aria-hidden="true" className="size-4" />
            โอกาสที่เกี่ยวข้องกับบริษัท
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">การแจ้งเตือน</h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
            TOR ที่ตรงกับผลงาน และความเคลื่อนไหวของโครงการที่เคยตรงกัน รวมไว้ในที่เดียว
          </p>
        </div>
        <Button variant="outline" onClick={reload} disabled={busy}>
          <RefreshCw aria-hidden="true" />
          รีเฟรช
        </Button>
      </div>
      {verificationToken && !verified && (
        <section
          className="bg-primary/5 border-primary/20 mt-6 rounded-xl border p-5"
          aria-labelledby="verify-email-heading"
        >
          <h2 id="verify-email-heading" className="font-semibold">
            ยืนยันอีเมลสำหรับบัญชีนี้
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            กดยืนยันเมื่อคุณเป็นผู้ร้องขอลิงก์นี้เท่านั้น
          </p>
          <Button
            className="mt-4"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await verifyNotificationEmail(verificationToken);
                setVerified(true);
                window.history.replaceState(null, '', '/notifications');
              }, 'ยืนยันอีเมลแล้ว คุณสามารถเปิดการแจ้งเตือนทางอีเมลได้')
            }
          >
            ยืนยันอีเมล
          </Button>
        </section>
      )}
      {(loadError || error) && (
        <div
          role="alert"
          className="text-destructive mt-5 flex flex-wrap items-center gap-3 text-sm"
        >
          {error ?? loadError}
          <Link className="underline underline-offset-4" href="/login">
            เข้าสู่ระบบ
          </Link>
        </div>
      )}
      <p role="status" className="text-primary mt-4 min-h-5 text-sm">
        {notice}
      </p>
      <div className="mt-4 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <section aria-labelledby="inbox-heading" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <h2 id="inbox-heading" className="text-lg font-semibold">
              กล่องข้อความ{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {data ? `· ยังไม่อ่าน ${data.unread_count}` : ''}
              </span>
            </h2>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !data?.unread_count}
              onClick={() => void act(readAllNotifications, 'ทำเครื่องหมายทั้งหมดว่าอ่านแล้ว')}
            >
              <CheckCheck aria-hidden="true" />
              อ่านทั้งหมด
            </Button>
          </div>
          <div className="mt-4 flex gap-2" aria-label="กรองการแจ้งเตือน">
            {(['all', 'unread'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setPage(0);
                }}
              >
                {value === 'all' ? 'ทั้งหมด' : 'ยังไม่อ่าน'}
              </Button>
            ))}
          </div>
          {!data && !loadError && (
            <p className="text-muted-foreground py-12 text-sm">กำลังโหลดการแจ้งเตือน…</p>
          )}
          {data && data.items.length === 0 && (
            <div className="border-border mt-5 rounded-xl border border-dashed px-6 py-14 text-center">
              <InboxIcon aria-hidden="true" className="text-muted-foreground mx-auto size-8" />
              <h3 className="mt-4 font-medium">
                {filter === 'unread' ? 'อ่านครบแล้ว' : 'ยังไม่มีการแจ้งเตือน'}
              </h3>
              <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
                {filter === 'unread'
                  ? 'กลับมาดูโอกาสใหม่ได้ภายหลัง'
                  : 'เมื่อพบ TOR ที่เทคโนโลยีและแพลตฟอร์มตรงกับผลงานตั้งแต่ 70% ระบบจะแจ้งให้คุณทราบ'}
              </p>
              {filter === 'all' && (
                <Link
                  href="/company"
                  className="text-primary mt-5 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                >
                  ตรวจสอบข้อมูลบริษัทและผลงาน
                </Link>
              )}
            </div>
          )}
          {data && data.items.length > 0 && (
            <ul className="mt-5 overflow-hidden rounded-xl border" aria-label="รายการแจ้งเตือน">
              {data.items.map((item) => (
                <NotificationItem key={item.id} item={item} busy={busy} onAction={update} />
              ))}
            </ul>
          )}
          {data && data.total > 20 && (
            <nav
              aria-label="หน้าการแจ้งเตือน"
              className="mt-5 flex items-center justify-between gap-3"
            >
              <Button
                variant="outline"
                disabled={page === 0 || busy}
                onClick={() => setPage((value) => value - 1)}
              >
                ก่อนหน้า
              </Button>
              <span className="text-muted-foreground text-sm">
                หน้า {page + 1} จาก {Math.ceil(data.total / 20)}
              </span>
              <Button
                variant="outline"
                disabled={(page + 1) * 20 >= data.total || busy}
                onClick={() => setPage((value) => value + 1)}
              >
                ถัดไป
              </Button>
            </nav>
          )}
        </section>
        {settings && (
          <NotificationPreferencesPanel
            key={JSON.stringify(settings)}
            settings={settings}
            onSaved={(message) => {
              setNotice(message);
              reload();
            }}
          />
        )}
      </div>
    </main>
  );
}
