'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUserPatch,
  type AdminUserResponse,
} from '@/lib/api';

/**
 * Everything the accounts console reads and writes: the one list fetch, and the
 * single patch that promotes, demotes, activates or deactivates a row.
 *
 * Follows the ingestion console's split — the hook owns fetching and the
 * in-flight row; the component owns layout. A failed write refetches so the row
 * snaps back to what the server actually holds rather than keeping an
 * optimistic value the API rejected.
 */

export interface AccountsData {
  accounts: AdminUserResponse[];
  loading: boolean;
  /** A load failure — the whole table is unavailable. */
  error: string | null;
  /** The row currently being written, if any. */
  pendingId: string | null;
  /** A write failure — the table still stands; this names what was refused. */
  actionError: string | null;
  updateAccount: (id: string, patch: AdminUserPatch) => Promise<void>;
}

export function useAccountsData(): AccountsData {
  const [accounts, setAccounts] = useState<AdminUserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUsers().then(
      ({ users }) => {
        if (cancelled) return;
        setAccounts(users);
        setError(null);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'โหลดรายชื่อบัญชีไม่สำเร็จ');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const updateAccount = useCallback(async (id: string, patch: AdminUserPatch) => {
    setPendingId(id);
    setActionError(null);
    try {
      const updated = await updateAdminUser(id, patch);
      setAccounts((current) => current.map((account) => (account.id === id ? updated : account)));
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : 'แก้ไขบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง',
      );
      setRefreshKey((key) => key + 1);
    } finally {
      setPendingId(null);
    }
  }, []);

  return { accounts, loading, error, pendingId, actionError, updateAccount };
}
