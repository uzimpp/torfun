'use client';

import { useState } from 'react';
import { Mail, MessageCircle } from 'lucide-react';
import type { NotificationPreferences, NotificationSettingsResponse } from '@torfun/types';
import {
  disconnectNotificationChannel,
  requestNotificationEmail,
  saveNotificationPreferences,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notificationError } from './use-inbox-data';

export function NotificationPreferencesPanel({
  settings,
  onSaved,
}: {
  settings: NotificationSettingsResponse;
  onSaved: (message: string) => void;
}) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(settings.preferences);
  const [email, setEmail] = useState(settings.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved(message);
    } catch (caught) {
      setError(notificationError(caught));
    } finally {
      setBusy(false);
    }
  };
  const events = [
    ['match_found', 'พบ TOR ที่ตรงกับบริษัท'],
    ['status_changed', 'สถานะ TOR ที่เคยตรงกันเปลี่ยนแปลง'],
  ] as const;
  return (
    <section aria-labelledby="preferences-heading" className="border-border border-t pt-8">
      <h2 id="preferences-heading" className="text-lg font-semibold">
        เลือกการแจ้งเตือน
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        แจ้งเมื่อคะแนนเทียบผลงานตั้งแต่ {Math.round(settings.match_threshold * 100)}% ขึ้นไป
        เลือกแต่ละช่องทางแยกกันได้
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => saveNotificationPreferences(preferences), 'บันทึกการแจ้งเตือนแล้ว');
        }}
      >
        <div className="mt-5 space-y-5">
          {events.map(([event, title]) => (
            <fieldset key={event} disabled={busy}>
              <legend className="text-sm font-medium">{title}</legend>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {(['in_app', 'email', 'line'] as const).map((channel) => {
                  const unavailable =
                    channel === 'email'
                      ? !settings.email_available || !settings.email_verified
                      : channel === 'line'
                        ? !settings.line_available || !settings.line_connected
                        : false;
                  return (
                    <label key={channel} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-primary size-4"
                        checked={preferences[event][channel]}
                        disabled={unavailable && !preferences[event][channel]}
                        onChange={(change) =>
                          setPreferences((value) => ({
                            ...value,
                            [event]: { ...value[event], [channel]: change.target.checked },
                          }))
                        }
                      />
                      {channel === 'in_app' ? 'ในระบบ' : channel === 'email' ? 'อีเมล' : 'LINE'}
                      <span className="sr-only">: {title}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <Button className="mt-4" disabled={busy} type="submit">
          {busy ? 'กำลังบันทึก…' : 'บันทึกการแจ้งเตือน'}
        </Button>
      </form>
      <div className="mt-8 border-t pt-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Mail aria-hidden="true" className="size-4" />
          อีเมลสำหรับรับการแจ้งเตือน
        </h3>
        <p className="text-muted-foreground mt-2 text-sm">
          {!settings.email_available
            ? 'ผู้ดูแลระบบยังไม่ได้ตั้งค่าการส่งอีเมล'
            : settings.email_verified
              ? `ยืนยันแล้ว: ${settings.email}`
              : settings.email
                ? `รอการยืนยัน: ${settings.email}`
                : 'ยืนยันอีเมลก่อนเปิดรับการแจ้งเตือน'}
        </p>
        {settings.email_available && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () => requestNotificationEmail(email),
                'ส่งลิงก์ยืนยันแล้ว กรุณาตรวจสอบอีเมลและเปิดลิงก์ภายใน 30 นาที',
              );
            }}
          >
            <label htmlFor="notification-email" className="text-sm">
              อีเมล
            </label>
            <Input
              id="notification-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
            <Button type="submit" variant="outline" disabled={busy}>
              ส่งลิงก์ยืนยันอีเมล
            </Button>
          </form>
        )}
        {settings.email && (
          <Button
            type="button"
            className="mt-3"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(() => disconnectNotificationChannel('email'), 'ยกเลิกอีเมลแล้ว')
            }
          >
            ยกเลิกอีเมลนี้
          </Button>
        )}
      </div>
      <div className="mt-6 border-t pt-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle aria-hidden="true" className="size-4" />
          LINE Official Account
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {!settings.line_available
            ? 'ผู้ดูแลระบบยังไม่ได้ตั้งค่า LINE Official Account'
            : settings.line_connected
              ? 'เชื่อมต่อแล้ว รับข้อความในแอป LINE ของคุณ'
              : settings.line_linked
                ? 'บัญชีเชื่อมต่อแล้ว แต่หยุดรับข้อความ กรุณาเพิ่มเพื่อนหรือปลดบล็อก Torfun บน LINE'
                : 'เพิ่มเพื่อน Torfun แล้วพิมพ์ “เชื่อมต่อ” ในแชต เปิดลิงก์ที่ได้รับเพื่อยืนยันบัญชี'}
        </p>
        {settings.line_add_friend_url && !settings.line_connected && (
          <a
            className="text-primary mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
            href={settings.line_add_friend_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            เพิ่มเพื่อน Torfun บน LINE<span className="sr-only"> (เปิดแท็บใหม่)</span>
          </a>
        )}
        {settings.line_linked && (
          <Button
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() =>
              void run(() => disconnectNotificationChannel('line'), 'ยกเลิกการเชื่อมต่อ LINE แล้ว')
            }
          >
            ยกเลิกการเชื่อมต่อ LINE
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive mt-4 text-sm">
          {error}
        </p>
      )}
    </section>
  );
}
