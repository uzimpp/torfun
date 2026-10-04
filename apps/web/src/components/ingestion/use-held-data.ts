'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Procurement } from '@torfun/types';
import { ApiError, SessionEndedError, fetchProjects } from '@/lib/api';
import { SESSION_ENDED_MESSAGE } from './use-ingestion-data';

/** How many held records one card reads; the card says when there are more. */
export const HELD_LIMIT = 50;

export interface HeldData {
  items: Procurement[] | null;
  total: number;
  error: string | null;
  sessionEnded: boolean;
  retry: () => void;
}

/**
 * The records held for review: the admin list filtered to `needs_review`.
 * `reloadKey` is bumped by the console when an action elsewhere may have moved a
 * record in or out, so the card reads again without owning that coordination.
 */
export function useHeldData(reloadKey: number): HeldData {
  const [items, setItems] = useState<Procurement[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  /** Bumped to read again after a failure. */
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProjects({ outcome: 'needs_review', limit: HELD_LIMIT }).then(
      (loaded) => {
        if (cancelled) return;
        setItems(loaded.items);
        setTotal(loaded.total);
        setError(null);
        setSessionEnded(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setSessionEnded(caught instanceof SessionEndedError);
        setError(
          caught instanceof SessionEndedError
            ? SESSION_ENDED_MESSAGE
            : caught instanceof ApiError && caught.status === 0
              ? 'ไม่สามารถโหลดรายการที่รอตรวจสอบได้ (เชื่อมต่อ API ไม่สำเร็จ)'
              : 'ไม่สามารถโหลดรายการที่รอตรวจสอบได้',
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey, retryKey]);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  return { items, total, error, sessionEnded, retry };
}
