import type { BudgetComparison, BudgetPeer, Procurement } from '@torfun/types';
import type { BudgetPeerCandidate } from '../repositories/procurement.repository';

/** How many similar TORs the statistics cover, and how many are listed. */
export const PEER_LIMIT = 20;
export const PEERS_SHOWN = 5;

const normalise = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

/** Linear-interpolated quantile of an ascending list. */
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (at - low);
}

/**
 * Ranks candidates by what they share with the TOR: a technology term counts
 * twice a platform, because a platform such as "web" alone matches most TORs.
 * When the TOR names any technology, a peer must share at least one term.
 */
export function compareBudget(
  tor: Procurement,
  candidates: BudgetPeerCandidate[],
): BudgetComparison {
  const tech = new Set((tor.analysis?.techStack ?? []).map(normalise));
  const platforms = new Set<string>(tor.analysis?.targetPlatforms ?? []);
  const ranked = candidates
    .filter((peer) => peer.projectId !== tor.projectId && peer.projectMoney > 0)
    .map((peer) => {
      const sharedTech = [...new Set(peer.techStack.map(normalise))].filter((t) => tech.has(t));
      const sharedPlatforms = [...new Set(peer.targetPlatforms)].filter((p) => platforms.has(p));
      return {
        peer,
        sharedTech,
        shared: [...sharedTech, ...sharedPlatforms],
        score: 2 * sharedTech.length + sharedPlatforms.length,
      };
    })
    .filter((entry) => entry.score > 0 && (tech.size === 0 || entry.sharedTech.length > 0))
    .sort((a, b) => b.score - a.score || a.peer.projectId.localeCompare(b.peer.projectId))
    .slice(0, PEER_LIMIT);

  const budgets = ranked.map((entry) => entry.peer.projectMoney).sort((a, b) => a - b);
  const budget = tor.projectMoney !== null && tor.projectMoney > 0 ? tor.projectMoney : null;
  const stat = (q: number) => (budgets.length ? quantile(budgets, q) : null);
  const peers: BudgetPeer[] = ranked.slice(0, PEERS_SHOWN).map(({ peer, shared }) => ({
    projectId: peer.projectId,
    projectName: peer.projectName,
    deptName: peer.deptName,
    budget: peer.projectMoney,
    shared,
  }));
  return {
    projectId: tor.projectId,
    budget,
    peerCount: budgets.length,
    min: stat(0),
    p25: stat(0.25),
    median: stat(0.5),
    p75: stat(0.75),
    max: stat(1),
    percentile:
      budget !== null && budgets.length
        ? Math.round((budgets.filter((value) => value < budget).length / budgets.length) * 100)
        : null,
    peers,
  };
}
