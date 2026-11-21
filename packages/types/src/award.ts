import type { Contract, ContractSubmission } from './contracts';

/**
 * Turns the contract lines and bid submissions the open-data API published for
 * one project into what an officer reads: who won, at what agreed price, who bid
 * and what they offered (#142). Pure and local: it reads nothing, calls nothing,
 * and knows nothing about which TORfun procurement the lines belong to.
 *
 * Every rule is ADR-0022's, and each one leaves something out rather than guess:
 *
 *  1. A submitted bid price and the agreed contract price are different numbers
 *     and are never mixed, renamed or compared into a "winning price".
 *  2. A winner's own bid is shown only when exactly one bid in a single-item
 *     project carries exactly the winner's name. Which items a contract covers is
 *     not published, so with several items it is not guessed.
 *  3. Bidders are counted as distinct exact names. With any unnamed bid, or no
 *     bids at all, the count is null, never 0 or 1 by guess.
 *  4. A joint venture is a consortium line plus member lines under one contract
 *     number. Members are never winners of their own. Anything that does not
 *     clearly resolve to that is left "unresolved" and nothing is derived from it.
 *  5. The API's aggregate (`sumPriceAgree`) is shown as published and is never
 *     recomputed from the lines.
 *
 * UNVALIDATED: recognising a consortium line by its name prefix is a heuristic
 * built from a handful of projects. A joint venture whose name carries no such
 * prefix comes out unresolved, which is the safe answer.
 */

/** A name that opens the way a joint venture's own line does (กิจการค้าร่วม, กิจการร่วมค้า, Consortium). */
const CONSORTIUM_NAME = /^\s*(กิจการค้าร่วม|กิจการร่วมค้า|consortium)/i;

export type AwardStructure =
  | { kind: 'single'; contract: Contract }
  | { kind: 'joint_venture'; consortium: Contract; members: Contract[] }
  | {
      kind: 'unresolved';
      contracts: Contract[];
      /** `ambiguous_lines`: several lines under one number that are not clearly a consortium and its members. */
      reason: 'ambiguous_lines' | 'unnumbered_lines';
    };

/** Why a winner's own bid is not shown. */
export type WinnerBidUnavailable =
  'unresolved_winner' | 'no_bids' | 'multi_item' | 'no_exact_match';

export interface AwardWinnerBid {
  /** What the winner offered, as submitted; null where the submission carried no readable price. */
  submittedPrice: number | null;
  /** How many other bids in the item were priced below it; null where either price is unknown. */
  lowerBids: number | null;
}

export interface AwardEntry {
  structure: AwardStructure;
  /** The winner, or the consortium for a joint venture; null where unresolved. */
  winnerName: string | null;
  /** The agreed contract price of this contract (the consortium's line for a joint venture); null where unresolved or unpublished. */
  agreedContractPrice: number | null;
  winnerBid: AwardWinnerBid | null;
  /** Set exactly when `winnerBid` is null. */
  winnerBidUnavailable: WinnerBidUnavailable | null;
}

export interface AwardBid {
  merchantName: string | null;
  /** As submitted, never the agreed price. */
  submittedPrice: number | null;
}

/** One line item of the project and the bids on it. */
export interface AwardBidItem {
  seqNo: number | null;
  description: string | null;
  /** Cheapest first, unpriced last; ties and unpriced bids keep the order published. */
  bids: AwardBid[];
  /** Distinct exact names in this item; null where any bid is unnamed. */
  bidderCount: number | null;
  /** Over the priced bids only; null where none is priced. */
  lowest: number | null;
  highest: number | null;
  average: number | null;
  pricedBids: number;
}

export interface AwardSummary {
  /** `none`: no contract lines; `unresolved`: at least one award could not be resolved. */
  status: 'none' | 'resolved' | 'unresolved';
  /** The contract fiscal year when every line shares one; null otherwise. */
  contractYear: number | null;
  awards: AwardEntry[];
  /** As the API published them (repeated on every line); null where absent or where the lines disagree. */
  sumPriceAgree: number | null;
  projectMoney: number | null;
  priceBuild: number | null;
  items: AwardBidItem[];
  /** Distinct exact names across all items; null where there are no bids or any is unnamed. */
  bidderCount: number | null;
}

const compare = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b;

/** The one value every line agrees on; null where none gave one or they differ. */
function common<T>(values: readonly (T | null | undefined)[]): T | null {
  const given = values.filter((value): value is T => value !== null && value !== undefined);
  if (given.length === 0) return null;
  return given.every((value) => value === given[0]) ? given[0]! : null;
}

function structureOf(lines: readonly Contract[]): AwardStructure[] {
  if (lines.length === 0) return [];
  if (lines.length === 1) return [{ kind: 'single', contract: lines[0]! }];

  const byNumber = new Map<string, Contract[]>();
  const unnumbered: Contract[] = [];
  for (const line of lines) {
    if (line.contractNo === null) unnumbered.push(line);
    else byNumber.set(line.contractNo, [...(byNumber.get(line.contractNo) ?? []), line]);
  }

  const structures: AwardStructure[] = [];
  for (const group of byNumber.values()) {
    if (group.length === 1) {
      structures.push({ kind: 'single', contract: group[0]! });
      continue;
    }
    const consortia = group.filter((line) => CONSORTIUM_NAME.test(line.winnerName ?? ''));
    if (consortia.length === 1) {
      structures.push({
        kind: 'joint_venture',
        consortium: consortia[0]!,
        members: group.filter((line) => line !== consortia[0]),
      });
    } else {
      structures.push({ kind: 'unresolved', contracts: group, reason: 'ambiguous_lines' });
    }
  }
  // Lines with no contract number cannot be told apart, so they are not guessed at.
  if (unnumbered.length > 0) {
    structures.push({ kind: 'unresolved', contracts: unnumbered, reason: 'unnumbered_lines' });
  }
  return structures;
}

function bidItems(submissions: readonly ContractSubmission[]): AwardBidItem[] {
  const byItem = new Map<number | null, ContractSubmission[]>();
  for (const submission of submissions) {
    byItem.set(submission.seqNo, [...(byItem.get(submission.seqNo) ?? []), submission]);
  }

  return [...byItem.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([seqNo, rows]) => {
      const bids: AwardBid[] = rows
        .map((row) => ({ merchantName: row.merchantName, submittedPrice: row.submitPrice }))
        .sort((a, b) => compare(a.submittedPrice, b.submittedPrice));
      const prices = bids.flatMap((bid) =>
        bid.submittedPrice === null ? [] : [bid.submittedPrice],
      );
      const unnamed = bids.some((bid) => bid.merchantName === null);
      return {
        seqNo,
        description: rows.find((row) => row.seqNoDesc !== null)?.seqNoDesc ?? null,
        bids,
        bidderCount: unnamed ? null : new Set(bids.map((bid) => bid.merchantName)).size,
        lowest: prices.length > 0 ? Math.min(...prices) : null,
        highest: prices.length > 0 ? Math.max(...prices) : null,
        average:
          prices.length > 0
            ? Math.round((prices.reduce((sum, price) => sum + price, 0) / prices.length) * 100) /
              100
            : null,
        pricedBids: prices.length,
      };
    });
}

function entryOf(structure: AwardStructure, items: readonly AwardBidItem[]): AwardEntry {
  if (structure.kind === 'unresolved') {
    return {
      structure,
      winnerName: null,
      agreedContractPrice: null,
      winnerBid: null,
      winnerBidUnavailable: 'unresolved_winner',
    };
  }

  const line = structure.kind === 'single' ? structure.contract : structure.consortium;
  const base = {
    structure,
    winnerName: line.winnerName,
    agreedContractPrice: line.priceAgree,
  };
  const unavailable = (reason: WinnerBidUnavailable): AwardEntry => ({
    ...base,
    winnerBid: null,
    winnerBidUnavailable: reason,
  });

  if (items.length === 0) return unavailable('no_bids');
  // Which items a contract covers is not published, so several items are not guessed at.
  if (items.length > 1) return unavailable('multi_item');
  const matches = items[0]!.bids.filter(
    (bid) => bid.merchantName !== null && bid.merchantName === line.winnerName,
  );
  if (matches.length !== 1) return unavailable('no_exact_match');

  const price = matches[0]!.submittedPrice;
  return {
    ...base,
    winnerBid: {
      submittedPrice: price,
      lowerBids:
        price === null
          ? null
          : items[0]!.bids.filter(
              (bid) => bid.submittedPrice !== null && bid.submittedPrice < price,
            ).length,
    },
    winnerBidUnavailable: null,
  };
}

export function summariseAward(
  contracts: readonly Contract[],
  submissions: readonly ContractSubmission[],
): AwardSummary {
  const items = bidItems(submissions);
  const awards = structureOf(contracts).map((structure) => entryOf(structure, items));
  const everyBid = items.flatMap((item) => item.bids);

  return {
    status:
      awards.length === 0
        ? 'none'
        : awards.some((award) => award.structure.kind === 'unresolved')
          ? 'unresolved'
          : 'resolved',
    contractYear: common(contracts.map((line) => line.contractYear)),
    awards,
    sumPriceAgree: common(contracts.map((line) => line.sumPriceAgree)),
    projectMoney: common(contracts.map((line) => line.projectMoney)),
    priceBuild: common(contracts.map((line) => line.priceBuild)),
    items,
    bidderCount:
      everyBid.length === 0 || everyBid.some((bid) => bid.merchantName === null)
        ? null
        : new Set(everyBid.map((bid) => bid.merchantName)).size,
  };
}
