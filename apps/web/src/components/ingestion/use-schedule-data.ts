'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduleView } from '@torfun/types';
import { ApiError, SessionEndedError } from '@/lib/api';
import { fetchSchedule, updateSchedule } from '@/lib/api-schedule';
import { toUpdate, type ScheduleFormValues } from './schedule-form';

export interface ScheduleData {
  schedule: ScheduleView | null;
  loading: boolean;
  /** Why the schedule could not be read. */
  error: string | null;
  /** The API refused to renew the session: sign in again, retrying only repeats the refusal. */
  sessionEnded: boolean;
  saving: boolean;
  /** Why the last save was refused; the schedule shown is unchanged. */
  saveError: string | null;
  /** True from a successful save until the next one begins. */
  saved: boolean;
  save: (values: ScheduleFormValues) => Promise<void>;
  retry: () => void;
}

const messageFor = (caught: unknown, fallback: string) =>
  caught instanceof ApiError ? caught.message : fallback;

/**
 * Owns what the schedule card reads and writes: the one fetch, the save, and
 * which of "loading", "could not load", "session over" and "save refused" the
 * card is in. The card holds only the draft the person is editing.
 *
 * No polling: the schedule changes when an administrator changes it, and the
 * card shows the server's answer to their own save.
 */
export function useScheduleData(): ScheduleData {
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Bumped to read again after a failure. */
  const [refreshKey, setRefreshKey] = useState(0);
  /** A ref, not state: a second press in the same tick must see the first. */
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetchSchedule().then(
      (view) => {
        if (cancelled) return;
        setSchedule(view);
        setError(null);
        setSessionEnded(false);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setSessionEnded(caught instanceof SessionEndedError);
        setError(messageFor(caught, 'ไม่สามารถโหลดตารางเวลาอัตโนมัติได้'));
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const save = useCallback(async (values: ScheduleFormValues) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      setSchedule(await updateSchedule(toUpdate(values)));
      setSaved(true);
    } catch (caught) {
      setSessionEnded(caught instanceof SessionEndedError);
      setSaveError(messageFor(caught, 'ไม่สามารถบันทึกตารางเวลาได้'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);

  return { schedule, loading, error, sessionEnded, saving, saveError, saved, save, retry };
}
