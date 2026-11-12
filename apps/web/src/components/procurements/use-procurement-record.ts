'use client';

import type { Procurement } from '@torfun/types';
import { fetchTor } from '@/lib/api';
import type { LoadError } from '@/lib/api-errors';
import { usePolled } from '@/lib/use-polled';

export interface ProcurementRecord {
  record: Procurement | null;
  error: LoadError | null;
  reload: () => void;
}

/**
 * The record the drawer shows. A row on the current page is used as it is; a
 * deep link to one on another page (or filtered out) is read on its own.
 */
export function useProcurementRecord(
  id: string,
  listed: Procurement[],
  /** While the page is still loading, the record may yet turn up on it. */
  listLoading: boolean,
): ProcurementRecord {
  const onPage = id ? (listed.find((item) => item.projectId === id) ?? null) : null;
  const needsRead = id !== '' && !listLoading && onPage === null;
  const { data, error, reload } = usePolled(async () => ({ id, record: await fetchTor(id) }), {
    fallback: 'ไม่สามารถโหลดรายละเอียดประกาศได้',
    enabled: needsRead,
    deps: [id],
  });

  return {
    record: onPage ?? (data?.id === id ? data.record : null),
    error: needsRead ? error : null,
    reload,
  };
}
