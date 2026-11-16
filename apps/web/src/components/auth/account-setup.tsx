'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { certificateExpired, thailandDay, type NotificationSettingsResponse } from '@torfun/types';
import { fetchCompanyQualifications, fetchExperiences, fetchNotificationSettings } from '@/lib/api';
import { NotificationPreferencesPanel } from '@/components/notifications/notification-preferences';
import { notificationError } from '@/components/notifications/use-inbox-data';

/** Each check comes from the signed-in officer's saved data. */
export function AccountSetup({ hasCompany }: { hasCompany: boolean }) {
  const [data, setData] = useState<{
    settings: NotificationSettingsResponse;
    certificates: boolean;
    experiences: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const [settings, qualifications, experiences] = await Promise.all([
      fetchNotificationSettings(),
      hasCompany ? fetchCompanyQualifications() : Promise.resolve(null),
      hasCompany ? fetchExperiences() : Promise.resolve({ experiences: [] }),
    ]);
    return {
      settings,
      certificates: Boolean(
        qualifications?.certificates.some((c) => !certificateExpired(c, thailandDay(new Date()))),
      ),
      experiences: experiences.experiences.length > 0,
    };
  }, [hasCompany]);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) setData(value);
      },
      (caught) => {
        if (!cancelled) setError(notificationError(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);
  const refresh = async (message: string) => {
    setNotice(message);
    try {
      setData(await load());
      setError(null);
    } catch (caught) {
      setError(notificationError(caught));
    }
  };
  return (
    <section className="mt-8 space-y-6" aria-labelledby="setup-heading">
      <div className="rounded-xl border p-6">
        <h2 id="setup-heading" className="text-lg font-medium">
          เตรียมบัญชีให้พร้อม
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          เพิ่มข้อมูลเพื่อช่วยเทียบคุณสมบัติ ข้อมูลไม่ครบยังรับแจ้ง TOR
          เปิดใหม่ได้เมื่อเปิดตัวเลือกด้านล่าง
        </p>
        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <Link
            href={hasCompany ? '/company' : '/company-experiences'}
            className="text-primary underline underline-offset-4"
          >
            บริษัท ใบรับรอง และผลงาน
          </Link>
          <Link href="/notifications" className="text-primary underline underline-offset-4">
            กล่องการแจ้งเตือน
          </Link>
        </div>
        {data && (
          <ul className="mt-5 space-y-3 text-sm">
            {[
              ['เข้าร่วมบริษัท', hasCompany, '/company-experiences'],
              ['ใบรับรองบริษัทที่ยังไม่หมดอายุ', data.certificates, '/company'],
              ['ผลงานที่ผ่านมา', data.experiences, '/company'],
              ['ยืนยันอีเมล', data.settings.email_verified, '#notification-email'],
              ['เชื่อมต่อ LINE', data.settings.line_connected, '#preferences-heading'],
            ].map(([label, complete, href]) => (
              <li key={String(label)}>
                <Link href={String(href)} className="underline underline-offset-4">
                  {String(label)}
                </Link>
                <span className={complete ? 'text-primary ms-3' : 'text-muted-foreground ms-3'}>
                  {complete ? 'พร้อมแล้ว' : 'ยังไม่ครบ'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">กำลังอ่านการตั้งค่าบัญชี…</p>}
      {notice && (
        <p role="status" className="text-primary text-sm">
          {notice}
        </p>
      )}
      {data && (
        <NotificationPreferencesPanel
          key={JSON.stringify(data.settings)}
          settings={data.settings}
          onSaved={(message) => void refresh(message)}
        />
      )}
    </section>
  );
}
