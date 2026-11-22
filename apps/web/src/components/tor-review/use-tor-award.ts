'use client';

import { useEffect, useState } from 'react';
import {
  summariseAward,
  type AwardSummary,
  type Contract,
  type ContractSubmission,
} from '@torfun/types';
import { fetchTorContractSubmissions, fetchTorContracts } from '@/lib/api';

/**
 * The award summary of one procurement (#142), from open-data contract lines whose
 * `projectId` is **exactly** this procurement's project id.
 * There is no fuzzy match, no name match and no fallback to another project: a
 * line carrying any other id is dropped here even if the API returned it, and a
 * project with no line of its own is `null`, which the page shows as an empty
 * state, never as someone else's award.
 *
 * LIMITATION: which announcement round a contract belongs to is not decided here,
 * and no existing logic can decide it. Discovery's "latest announcement" rule
 * (`discovery.ts`: the newer `announceDate` of the same type, an invitation over a
 * draft) only picks which feed snapshot a TORfun record is built from, and the
 * timeline's `invitationMoved` only says the invitation PDF is stale. Neither
 * touches contracts, a contract line carries no announcement id or round, and its
 * dates are unparsed Thai text, so dates are not used to pick a contract. Lines of
 * every contract year under the exact id are therefore all kept. If a project is
 * re-announced under the same id, an earlier round's award can show on the
 * current TOR (re-announcement is untested).
 */
export function awardFor(
  projectId: string,
  contracts: readonly Contract[],
  submissions: readonly ContractSubmission[],
): AwardSummary | null {
  const own = contracts.filter((line) => line.projectId === projectId);
  const bids = submissions.filter((line) => line.projectId === projectId);
  return own.length === 0 && bids.length === 0 ? null : summariseAward(own, bids);
}

export type TorAwardState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; award: AwardSummary | null };

export function useTorAward(projectId: string): TorAwardState {
  const [result, setResult] = useState<{ projectId: string; state: TorAwardState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTorContracts(projectId), fetchTorContractSubmissions(projectId)]).then(
      ([contracts, submissions]) => {
        if (cancelled) return;
        setResult({
          projectId,
          state: {
            status: 'ready',
            award: awardFor(projectId, contracts.items, submissions.items),
          },
        });
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
