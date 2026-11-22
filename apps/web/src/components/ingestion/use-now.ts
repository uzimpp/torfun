'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, refreshed on an interval.
 *
 * "In this stage for 3 minutes" has to keep counting while a console sits open,
 * and the time cannot be read while rendering — the output would then depend
 * on when the render happened — so it lives in state and is moved by a timer.
 */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
