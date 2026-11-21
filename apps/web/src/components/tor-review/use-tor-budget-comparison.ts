'use client';

import { useEffect, useState } from 'react';
import type { BudgetComparison } from '@torfun/types';
import { fetchTorBudgetComparison } from '@/lib/api';

export type TorBudgetComparisonState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; comparison: BudgetComparison };

/** The budget comparison of one TOR (#61); never shows another project's while one loads. */
export function useTorBudgetComparison(projectId: string): TorBudgetComparisonState {
  const [result, setResult] = useState<{
    projectId: string;
    state: TorBudgetComparisonState;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTorBudgetComparison(projectId).then(
      (comparison) => {
        if (!cancelled) setResult({ projectId, state: { status: 'ready', comparison } });
      },
      () => {
        if (!cancelled) setResult({ projectId, state: { status: 'error' } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return result?.projectId === projectId ? result.state : { status: 'loading' };
}
