import type { Contract, ContractSubmission } from './contracts';

/**
 * Turns the contract lines and bid submissions the open-data API published for
 * one project into what an officer reads: who won, at what agreed price, who bid
 * and what they offered (#142). Pure and local: it reads nothing, calls nothing,
 * and knows nothing about which TORfun procurement the lines belong to.
 *
 * Each rule below leaves something out rather than guess:
 *
 *  1. A submitted bid price and the agreed contract price are different numbers
 *     and are never mixed, renamed or compared into a "winning price".
 *  2. A winner's own bid is shown only when exactly one bid in a single-item
 *     project carries exactly the winner's name. Which items a contract covers is
 *     not published, so with several items it is not guessed.
 *  3. Bidders are counted as distinct exact names. With any unnamed bid, or no
 *     bids at all, the count is null, never 0 or 1 by guess.
 *  3a. Bids are never pooled across contract years. A bid carries no year of its
 *     own in the source; the year is the one the sync asked the API for, so a
 *     line item is (contractYear, seqNo), a count is per year, and the project
 *     count is null where bids of several years exist. A winner's own bid is
 *     looked for only among the items of the contract line's own year. No date
 *     is used, and nothing tells announcement rounds apart.
 *  4. A joint venture is a consortium line plus member lines under one contract
 *     number in one contract year; lines of different years are never grouped
 *     together, whatever their numbers. A lone line whose number also appears in
 *     another year is left unresolved, not named a winner, since it may be a member
 *     or a consortium whose other lines are in that year. Members are never
 *     winners of their own.
 *     Anything that does not clearly resolve to that is left "unresolved" and
 *     nothing is derived from it.
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
      /**
       * `ambiguous_lines`: several lines under one number in one year that are not clearly a
       * consortium and its members. `unnumbered_lines`: lines with no contract number.
       * `number_in_other_year`: a lone line whose contract number also appears in another
       * year, so it may be a member or a consortium whose other lines sit in that year;
       * it is neither merged with them nor taken to be a winner of its own.
       */
      reason: 'ambiguous_lines' | 'unnumbered_lines' | 'number_in_other_year';
    };

/** Why a winner's own bid is not shown. */
export type WinnerBidUnavailable =
  | 'unresolved_winner'
  | 'no_bids'
  /** Bids are stored, but only for other contract years than this contract line's own. */
  | 'bids_in_other_year'
  | 'multi_item'
  | 'no_exact_match';

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

/** One line item of the project, in one contract year, and the bids on it. */
export interface AwardBidItem {
  /** The year the API was asked for when these bids were fetched, not a field the bids carry. */
  contractYear: number;
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

/** The bidders of one contract year; years are never added together. */
export interface AwardBidYear {
  contractYear: number;
  /** Distinct exact names in this year; null where there are none or any is unnamed. */
  bidderCount: number | null;
  /**
   * The project has a contract line of this year. Without one, these bids are not any
   * award's bids and are left out of the project-level count.
   */
  hasContractLine: boolean;
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
  /** One entry per contract year that has bids, oldest first. */
  bidYears: AwardBidYear[];
  /**
   * Distinct exact names across all bids; null where there are no bids, any is
   * unnamed, bids of more than one contract year exist, or the bids' year has no
   * contract line (see `bidYears`). The same rule `digestAward` applies in #144.
   */
  bidderCount: number | null;
}

/**
 * A name the source actually gave: not null, and not empty or only spaces. A blank name
 * is a missing name; nothing else about a name is changed (no trimming, no case or
 * spelling matching), so two names are still the same only when they are exactly equal.
 */
export function isNamed(name: string | null | undefined): name is string {
  return typeof name === 'string' && name.trim() !== '';
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

  // A contract is (contractYear, contractNo): lines of different years are never one
  // contract, joint venture or ambiguous group, even when the number is the same.
  const byContract = new Map<string, Contract[]>();
  const unnumberedByYear = new Map<number, Contract[]>();
  const yearsOfNumber = new Map<string, Set<number>>();
  for (const line of lines) {
    if (line.contractNo !== null) {
      yearsOfNumber.set(
        line.contractNo,
        (yearsOfNumber.get(line.contractNo) ?? new Set<number>()).add(line.contractYear),
      );
    }
    if (line.contractNo === null) {
      unnumberedByYear.set(line.contractYear, [
        ...(unnumberedByYear.get(line.contractYear) ?? []),
        line,
      ]);
    } else {
      const key = `${line.contractYear}|${line.contractNo}`;
      byContract.set(key, [...(byContract.get(key) ?? []), line]);
    }
  }

  const structures: AwardStructure[] = [];
  for (const group of byContract.values()) {
    if (group.length === 1) {
      const line = group[0]!;
      // A lone line whose number also appears in another year cannot be told apart from a
      // member, or a consortium, whose other lines are in that year: no winner is named.
      if ((yearsOfNumber.get(line.contractNo!)?.size ?? 0) > 1) {
        structures.push({ kind: 'unresolved', contracts: group, reason: 'number_in_other_year' });
      } else {
        structures.push({ kind: 'single', contract: line });
      }
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
  // Lines with no contract number cannot be told apart, so they are not guessed at,
  // and those of different years are not told apart from each other either.
  for (const [, group] of [...unnumberedByYear].sort(([a], [b]) => a - b)) {
    structures.push({ kind: 'unresolved', contracts: group, reason: 'unnumbered_lines' });
  }
  return structures;
}

/** Distinct exact names; null where there are no bids or any bid is unnamed. */
function countBidders(bids: readonly AwardBid[]): number | null {
  if (bids.length === 0 || bids.some((bid) => bid.merchantName === null)) return null;
  return new Set(bids.map((bid) => bid.merchantName)).size;
}

function bidItems(submissions: readonly ContractSubmission[]): AwardBidItem[] {
  // A line item is (contractYear, seqNo): the same item number in two years is not one item.
  const byItem = new Map<
    string,
    { contractYear: number; seqNo: number | null; rows: ContractSubmission[] }
  >();
  for (const submission of submissions) {
    const key = `${submission.contractYear}|${submission.seqNo ?? ''}`;
    const group = byItem.get(key);
    if (group) group.rows.push(submission);
    else
      byItem.set(key, {
        contractYear: submission.contractYear,
        seqNo: submission.seqNo,
        rows: [submission],
      });
  }

  return [...byItem.values()]
    .sort((a, b) => a.contractYear - b.contractYear || compare(a.seqNo, b.seqNo))
    .map(({ contractYear, seqNo, rows }) => {
      const bids: AwardBid[] = rows
        .map((row) => ({
          // A blank name is a missing name, here and in everything derived from the bids.
          merchantName: isNamed(row.merchantName) ? row.merchantName : null,
          submittedPrice: row.submitPrice,
        }))
        .sort((a, b) => compare(a.submittedPrice, b.submittedPrice));
      const prices = bids.flatMap((bid) =>
        bid.submittedPrice === null ? [] : [bid.submittedPrice],
      );
      return {
        contractYear,
        seqNo,
        description: rows.find((row) => row.seqNoDesc !== null)?.seqNoDesc ?? null,
        bids,
        bidderCount: countBidders(bids),
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
  // A winner whose name is blank has no name: it is never matched to a bid, blank or not.
  const winnerName = isNamed(line.winnerName) ? line.winnerName : null;
  const base = {
    structure,
    winnerName,
    agreedContractPrice: line.priceAgree,
  };
  const unavailable = (reason: WinnerBidUnavailable): AwardEntry => ({
    ...base,
    winnerBid: null,
    winnerBidUnavailable: reason,
  });

  // Only bids of the contract line's own year: bids of another year are not its bids.
  const own = items.filter((item) => item.contractYear === line.contractYear);
  if (own.length === 0) return unavailable(items.length === 0 ? 'no_bids' : 'bids_in_other_year');
  // Which items a contract covers is not published, so several items are not guessed at.
  if (own.length > 1) return unavailable('multi_item');
  const item = own[0]!;
  const matches = item.bids.filter(
    (bid) => bid.merchantName !== null && bid.merchantName === winnerName,
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
          : item.bids.filter((bid) => bid.submittedPrice !== null && bid.submittedPrice < price)
              .length,
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
  const contractYears = new Set(contracts.map((line) => line.contractYear));
  const bidYears: AwardBidYear[] = [...new Set(items.map((item) => item.contractYear))].map(
    (contractYear) => ({
      contractYear,
      hasContractLine: contractYears.has(contractYear),
      bidderCount: countBidders(
        items.filter((item) => item.contractYear === contractYear).flatMap((item) => item.bids),
      ),
    }),
  );

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
    bidYears,
    // Never added across years: with bids of several years there is no single count, and
    // bids of a year with no contract line are not the award's bids.
    bidderCount:
      bidYears.length === 1 && bidYears[0]!.hasContractLine ? bidYears[0]!.bidderCount : null,
  };
}
