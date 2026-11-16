'use client';

import type { Tombstone } from '@torfun/types';
import type { LoadError } from '@/lib/api-errors';
import { fetchTombstones } from '@/lib/api-tombstones';
import { usePolled } from '@/lib/use-polled';

export interface DroppedState {
  items: Tombstone[] | null;
  error: LoadError | null;
  reload: () => void;
}

/** Read only while `enabled`, so the main list does not pay for a tab nobody opened. */
export function useDroppedList(enabled: boolean): DroppedState {
  const { data, error, reload } = usePolled(fetchTombstones, {
    fallback: 'ไม่สามารถโหลดรายการที่ถูกคัดออกได้',
    enabled,
  });
  return { items: data, error, reload };
}
