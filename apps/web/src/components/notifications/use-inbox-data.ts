'use client';

import { useEffect, useRef, useState } from 'react';
import type { NotificationListResponse, NotificationSettingsResponse } from '@torfun/types';
import { ApiError, fetchNotifications, fetchNotificationSettings } from '@/lib/api';

export function notificationError(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
  if (error instanceof ApiError && error.status === 0)
    return 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง';
  return error instanceof Error ? error.message : 'โหลดการแจ้งเตือนไม่สำเร็จ';
}

export function useInboxData(filter: 'all' | 'unread', page: number) {
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [settings, setSettings] = useState<NotificationSettingsResponse | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const query = `${filter}:${page}`;
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const current = ++generation.current;
    let pending = false;
    const load = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const [inbox, preferences] = await Promise.all([
          fetchNotifications(filter, page * 20),
          fetchNotificationSettings(),
        ]);
        if (!cancelled && generation.current === current) {
          setData(inbox);
          setSettings(preferences);
          setLoadedQuery(`${filter}:${page}`);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled && generation.current === current) setError(notificationError(caught));
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [filter, page, refresh]);
  return {
    data: loadedQuery === query ? data : null,
    settings,
    error,
    reload: () => setRefresh((value) => value + 1),
  };
}
