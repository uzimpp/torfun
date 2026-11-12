'use client';

import type { Procurement } from '@torfun/types';
import { fetchProjects } from '@/lib/api';
import type { LoadError } from '@/lib/api-errors';
import { usePolled } from '@/lib/use-polled';

/** How many held records are read at once; the queue says when there are more. */
export const HELD_LIMIT = 50;

export interface HeldData {
  items: Procurement[] | null;
  total: number;
  error: LoadError | null;
  retry: () => void;
}

/**
 * The records held for review: the admin list filtered to `needs_review`.
 * `heldCount` is the held total some other read reported; when it moves, the
 * list is read again, so records a run holds appear without a reload.
 */
export function useHeldData(heldCount?: number): HeldData {
  const { data, error, reload } = usePolled(
    () => fetchProjects({ outcome: 'needs_review', limit: HELD_LIMIT }),
    { fallback: 'ไม่สามารถโหลดรายการที่รอตรวจสอบได้', deps: [heldCount] },
  );
  return { items: data?.items ?? null, total: data?.total ?? 0, error, retry: reload };
}
