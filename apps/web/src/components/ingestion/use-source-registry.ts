'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SourceAgencyEdit, SourceAgencyInput, SourceRegistryView } from '@torfun/types';
import { ApiError, SessionEndedError } from '@/lib/api';
import { addSource, editSource, fetchSources, removeSource } from '@/lib/api-sources';

export interface SourceRegistryData {
  registry: SourceRegistryView | null;
  loading: boolean;
  error: string | null;
  sessionEnded: boolean;
  /** A change is in flight; the controls are held so none is sent twice. */
  busy: boolean;
  /** Why the last change was refused; the registry shown is unchanged. */
  actionError: string | null;
  add: (input: SourceAgencyInput) => Promise<boolean>;
  edit: (deptId: string, edit: SourceAgencyEdit) => Promise<boolean>;
  remove: (deptId: string) => Promise<boolean>;
  retry: () => void;
}

const messageFor = (caught: unknown, fallback: string) =>
  caught instanceof ApiError ? caught.message : fallback;

/**
 * Owns the Source Registry card's fetching and changes. One read on mount, then
 * the server's answer to each change replaces what is shown; no polling.
 */
export function useSourceRegistry(): SourceRegistryData {
  const [registry, setRegistry] = useState<SourceRegistryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchSources().then(
      (view) => {
        if (cancelled) return;
        setRegistry(view);
        setError(null);
        setSessionEnded(false);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setSessionEnded(caught instanceof SessionEndedError);
        setError(messageFor(caught, 'ไม่สามารถโหลดรายชื่อหน่วยงานได้'));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const change = useCallback(
    async (call: () => Promise<SourceRegistryView>, fallback: string): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setActionError(null);
      try {
        setRegistry(await call());
        return true;
      } catch (caught) {
        setSessionEnded(caught instanceof SessionEndedError);
        setActionError(messageFor(caught, fallback));
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const add = useCallback(
    (input: SourceAgencyInput) => change(() => addSource(input), 'ไม่สามารถเพิ่มหน่วยงานได้'),
    [change],
  );
  const edit = useCallback(
    (deptId: string, update: SourceAgencyEdit) =>
      change(() => editSource(deptId, update), 'ไม่สามารถแก้ไขหน่วยงานได้'),
    [change],
  );
  const remove = useCallback(
    (deptId: string) => change(() => removeSource(deptId), 'ไม่สามารถลบหน่วยงานได้'),
    [change],
  );

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRefreshKey((key) => key + 1);
  }, []);

  return { registry, loading, error, sessionEnded, busy, actionError, add, edit, remove, retry };
}
