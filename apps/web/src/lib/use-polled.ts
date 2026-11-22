'use client';

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { toLoadError, type LoadError } from './api-errors';

export interface Polled<T> {
  /** The last successful read; kept on screen through later reads and failures. */
  data: T | null;
  /** Why the last read failed; polling waits until `reload`. */
  error: LoadError | null;
  /** True while enabled and nothing has been read yet. */
  loading: boolean;
  /** When `data` was read. */
  updatedAt: Date | null;
  reload: () => void;
}

export interface PollOptions<T> {
  /** The message when a failure carries none of its own. */
  fallback: string;
  /**
   * The pause between one read finishing and the next starting, or null to read
   * only on mount, `deps` change and `reload`. A function decides from the last read.
   */
  intervalMs?: number | null | ((data: T | null) => number | null);
  /** While false nothing is read. */
  enabled?: boolean;
  /** A change abandons any read in flight, clears the error and reads again. */
  deps?: DependencyList;
}

const sameDeps = (a: DependencyList, b: DependencyList) =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/**
 * One read, repeated on a timer that starts only once the previous read is
 * done, so a slow API is never cut off by the next tick. Polling stops while an
 * error stands: repeating a failing call cannot recover an ended session.
 */
export function usePolled<T>(
  load: () => Promise<T>,
  { fallback, intervalMs = null, enabled = true, deps = [] }: PollOptions<T>,
): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [request, setRequest] = useState(0);
  const [seen, setSeen] = useState({ deps, generation: 0 });
  if (!sameDeps(seen.deps, deps)) {
    setSeen({ deps, generation: seen.generation + 1 });
    setError(null);
  }

  const latest = useRef({ load, fallback });
  const inFlight = useRef(false);
  useEffect(() => {
    latest.current = { load, fallback };
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    inFlight.current = true;
    latest.current.load().then(
      (value) => {
        if (cancelled) return;
        inFlight.current = false;
        setData(value);
        setError(null);
        setUpdatedAt(new Date());
      },
      (caught: unknown) => {
        if (cancelled) return;
        inFlight.current = false;
        setError(toLoadError(caught, latest.current.fallback));
      },
    );
    return () => {
      cancelled = true;
      inFlight.current = false;
    };
  }, [enabled, request, seen.generation]);

  const interval = typeof intervalMs === 'function' ? intervalMs(data) : intervalMs;
  useEffect(() => {
    if (!enabled || error || interval === null || inFlight.current) return;
    const timer = setTimeout(() => {
      if (!inFlight.current) setRequest((key) => key + 1);
    }, interval);
    return () => clearTimeout(timer);
  }, [enabled, error, interval, updatedAt]);

  const reload = useCallback(() => {
    setError(null);
    setRequest((key) => key + 1);
  }, []);

  return {
    data,
    error,
    loading: enabled && updatedAt === null && error === null,
    updatedAt,
    reload,
  };
}
