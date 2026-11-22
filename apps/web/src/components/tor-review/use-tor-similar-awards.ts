'use client';

import { useCallback, useRef, useState } from 'react';
import type { SimilarAwards } from '@torfun/types';
import { fetchTorSimilarAwards } from '@/lib/api';

export type TorSimilarAwardsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; result: SimilarAwards };

/**
 * The similar past awards of one TOR (#144), asked only when `search` is
 * called, never on load: a search spends the open-data API's daily allowance. A search
 * already running is not started again, and an answer for another project (the page
 * moved on while it ran) is dropped, so one TOR never shows another's.
 */
export function useTorSimilarAwards(projectId: string) {
  const [stored, setStored] = useState<{ projectId: string; state: TorSimilarAwardsState } | null>(
    null,
  );
  const running = useRef<string | null>(null);

  const search = useCallback(() => {
    if (running.current === projectId) return;
    running.current = projectId;
    setStored({ projectId, state: { status: 'loading' } });
    fetchTorSimilarAwards(projectId).then(
      (result) => {
        if (running.current === projectId) running.current = null;
        setStored((current) =>
          current?.projectId === projectId
            ? { projectId, state: { status: 'ready', result } }
            : current,
        );
      },
      () => {
        if (running.current === projectId) running.current = null;
        setStored((current) =>
          current?.projectId === projectId ? { projectId, state: { status: 'error' } } : current,
        );
      },
    );
  }, [projectId]);

  const state: TorSimilarAwardsState =
    stored?.projectId === projectId ? stored.state : { status: 'idle' };
  return { state, search };
}
