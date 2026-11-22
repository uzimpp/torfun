import { isNamed, summariseAward, type AwardSummary } from './award';
import { compareBudget, type BudgetCandidate } from './budget-comparison';
import type { Contract, ContractSubmission } from './contracts';

/**
 * The pure computation behind #144: what one similar past procurement
 * tells us about its award, and a competition level read from many of them.
 * Pure and local: it reads nothing, calls nothing, and is wired to no route or
 * page. Its inputs are the comparables the caller chose and the award summary
 * `summariseAward` made for each, so every safeguard of that function
 * (exact names, no pooling across contract years, unresolved winners left
 * unresolved) is inherited, not repeated.
 *
 * TESTED, NOT VERIFIED AGAINST REAL DATA. The logic is covered by fixtures. No
 * real contract or bid data has been read, the link between a TORfun project and
 * its open-data id is only partly confirmed, and the threshold
 * between few and many is a provisional default (below).
 *
 * Bidder-data limits, stated and not corrected. A bidder is a distinct
 * exact `merchant_name` within one contract year. Names are never normalised,
 * matched, merged or compared across projects, so one company under two spellings
 * counts twice, and the members of a joint venture are not its bidders (the
 * consortium is). The bidder list has no status, so a disqualified bidder cannot be
 * told from the others and counts; submissions carry no TIN. Open data holds
 * signed contracts only, so cancelled or unsigned tenders are absent and a count
 * can understate how many bid. A count can therefore be too high or too low, and
 * the level always carries the basis it was read from.
 *
 * What it will not do:
 *  - it never calls anything a "winning price": the price is the agreed contract
 *    price, and neither the winner's submitted bid nor `sumPriceAgree` is used;
 *  - an empty bidder count is never 0 or 1, and never enters the level;
 *  - price figures are given only for a clean award (one contract, one year, one
 *    line item, a known bidder count), because the prices of different items,
 *    years or contracts have no common meaning;
 *  - a ratio above 1 is shown as it is, never capped.
 */

/**
 * PROVISIONAL. Fewest comparables with a known bidder count before any level is
 * given. 5 is the minimum #61 uses for budgets; bidder counts may be sparser, so it
 * is not settled until real data shows how many comparables have a known count.
 */
export const COMPETITION_MIN_SAMPLE = 5;

/**
 * PROVISIONAL. The largest median bidder count still called "few"; a larger one is
 * "many". 3 is a proposed default, not an industry standard and not
 * something real data has shown. It is validated against the real distribution of
 * bidder counts before it ships, and is a parameter so that it can change without
 * touching the logic.
 */
export const PROVISIONAL_FEW_BIDDERS_MAX = 3;

export interface CompetitionThresholds {
  /** A median of this many bidders or fewer is "few"; more is "many". */
  fewMax: number;
}

/** Frozen: a consumer cannot change the provisional default for everyone; pass `thresholds` instead. */
export const DEFAULT_COMPETITION_THRESHOLDS: Readonly<CompetitionThresholds> = Object.freeze({
  fewMax: PROVISIONAL_FEW_BIDDERS_MAX,
});

/** The comparable; `budget` is the planned budget, never a price. */
export interface CompetitionProject {
  projectId: string;
  projectName: string;
  deptName: string;
  /** Planned procurement budget in baht (`projectMoney`); null where not known. */
  budget: number | null;
  budgetYear: number | null;
  announceDate: string | null;
}

/** Why a bidder count is empty. */
export type BidderCountGap =
  | 'no_bids'
  | 'unnamed_bidder'
  | 'several_years'
  /** The bids are of a contract year the project has no contract line for: not that award's bids. */
  | 'year_without_contract';

export interface AwardDigestWinner {
  name: string;
  /** The winner is a joint venture's consortium, counted as one bidder. */
  jointVenture: boolean;
}

/** Price figures of a clean award only. */
export interface AwardDigestPrices {
  /** The agreed contract price of the one contract (the consortium's for a joint venture); null where unpublished. */
  agreedPrice: number | null;
  /**
   * True where a price was published but is 0 or less, or not a finite number. No contract is agreed at no price,
   * and a member line of a joint venture carries 0, so such a figure is
   * kept as published but is not used for a ratio, and is flagged rather than hidden.
   */
  agreedPriceUnusable: boolean;
  /**
   * `agreedPrice / budget`; may exceed 1 and is never capped. Null where either is
   * unknown, the budget is not a positive finite number, or the price is unusable.
   */
  agreedToBudget: number | null;
  /** True exactly when `agreedToBudget` is above 1. */
  exceedsBudget: boolean;
  /** Mean submitted bid of the item over its priced bids; null where none was priced. */
  averageBid: number | null;
  pricedBids: number;
}

export interface AwardDigest {
  project: CompetitionProject;
  /** At least one contract line is stored for the project. Without one it is not a past award. */
  hasContractData: boolean;
  /** `none`: no contract lines; `resolved`: every award has a determined, named winner; `not_determined`: at least one has not. */
  winnerStatus: 'none' | 'resolved' | 'not_determined';
  /** The resolved awards' winners only; empty where none is resolved. */
  winners: AwardDigestWinner[];
  /**
   * Awards whose winner could not be determined: unresolved (see `summariseAward`), or
   * resolved in structure but with no winner name published. Their lines are not used here.
   */
  undeterminedAwards: number;
  /** Distinct exact bidder names; null where unknown, never 0 or 1 by guess. */
  bidderCount: number | null;
  /** Set exactly when `bidderCount` is null. */
  bidderCountGap: BidderCountGap | null;
  /**
   * One resolved award, one contract year, one line item in that year, and a known
   * bidder count: the only case in which price figures mean anything.
   */
  clean: boolean;
  /** Null unless `clean`. */
  prices: AwardDigestPrices | null;
}

/** A planned budget as a finite number, or null: NaN and the infinities are not budgets. */
function usableBudget(budget: number | null): number | null {
  return budget !== null && Number.isFinite(budget) ? budget : null;
}

/** The contract years the project's lines are of, over every award, resolved or not. */
function contractYearsOf(award: AwardSummary): Set<number> {
  const years = new Set<number>();
  for (const entry of award.awards) {
    const { structure } = entry;
    if (structure.kind === 'single') years.add(structure.contract.contractYear);
    else if (structure.kind === 'joint_venture') {
      years.add(structure.consortium.contractYear);
      for (const member of structure.members) years.add(member.contractYear);
    } else {
      for (const contract of structure.contracts) years.add(contract.contractYear);
    }
  }
  return years;
}

/**
 * One comparable's award, in the terms #144 shows. `award` is what `summariseAward`
 * returned for the contract lines and bids stored under the comparable's exact
 * project id.
 */
export function digestAward(project: CompetitionProject, award: AwardSummary): AwardDigest {
  const hasContractData = award.awards.length > 0;
  const winners = award.awards.flatMap((entry): AwardDigestWinner[] =>
    entry.structure.kind === 'unresolved' || !isNamed(entry.winnerName)
      ? []
      : [{ name: entry.winnerName, jointVenture: entry.structure.kind === 'joint_venture' }],
  );
  // A winner with no published name (missing, empty or only spaces) is no determined
  // winner, whatever the structure says.
  const undeterminedAwards = award.awards.filter(
    (entry) => entry.structure.kind === 'unresolved' || !isNamed(entry.winnerName),
  ).length;

  // A bid belongs to the award only if the project has a contract line of the bid's year.
  const years = contractYearsOf(award);
  const bidsMatchContracts = award.bidYears.every((year) => years.has(year.contractYear));
  const bidderCount = bidsMatchContracts ? award.bidderCount : null;
  const bidderCountGap: BidderCountGap | null =
    bidderCount !== null
      ? null
      : award.items.length === 0
        ? 'no_bids'
        : award.bidYears.length > 1
          ? 'several_years'
          : !bidsMatchContracts
            ? 'year_without_contract'
            : 'unnamed_bidder';

  const only = award.awards.length === 1 ? award.awards[0]! : null;
  const item = award.items.length === 1 ? award.items[0]! : null;
  const clean =
    award.status === 'resolved' &&
    only !== null &&
    only.structure.kind !== 'unresolved' &&
    isNamed(only.winnerName) &&
    // Every contract line shares one year, and the bids are of that same year.
    award.contractYear !== null &&
    item !== null &&
    item.contractYear === award.contractYear &&
    bidderCount !== null;

  let prices: AwardDigestPrices | null = null;
  if (clean && only && item) {
    const budget = usableBudget(project.budget);
    const price = only.agreedContractPrice;
    // Not a usable price: 0 or less, or not a finite number (NaN, an infinity).
    const agreedPriceUnusable = price !== null && !(Number.isFinite(price) && price > 0);
    const ratio =
      price !== null && !agreedPriceUnusable && budget !== null && budget > 0
        ? price / budget
        : null;
    prices = {
      agreedPrice: price,
      agreedPriceUnusable,
      agreedToBudget: ratio,
      exceedsBudget: ratio !== null && ratio > 1,
      averageBid: item.average,
      pricedBids: item.pricedBids,
    };
  }

  return {
    project,
    hasContractData,
    winnerStatus: !hasContractData
      ? 'none'
      : undeterminedAwards > 0
        ? 'not_determined'
        : 'resolved',
    winners,
    undeterminedAwards,
    bidderCount,
    bidderCountGap,
    clean,
    prices,
  };
}

/** `digestAward` from the stored contract lines and bids of one project. */
export function digestFromLines(
  project: CompetitionProject,
  contracts: readonly Contract[],
  submissions: readonly ContractSubmission[],
): AwardDigest {
  return digestAward(project, summariseAward(contracts, submissions));
}

export type CompetitionLevel = 'few' | 'many';

export interface CompetitionBidders {
  min: number;
  /** The middle count, or the mean of the two middle ones for an even number of comparables. */
  median: number;
  max: number;
  /** Comparables with `fewMax` bidders or fewer. */
  few: number;
  /** Comparables with more than `fewMax` bidders. */
  many: number;
}

export interface CompetitionSummary {
  /** The boundary used, and that it is a provisional default, not a verified standard. */
  thresholds: CompetitionThresholds & { provisional: true };
  minSample: number;
  /** The minimum sample is a provisional default too (see `COMPETITION_MIN_SAMPLE`). */
  minSampleProvisional: true;
  /** Digests of a project already given earlier in the list, left out so that it is not counted twice. */
  duplicatesIgnored: number;
  /**
   * The basis, narrowing step by step, so a level is never read without it:
   * every comparable given, those with contract data, those with a resolved winner,
   * those with a known bidder count (what the level is read from) and the clean ones.
   */
  comparables: number;
  withContractData: number;
  withResolvedWinner: number;
  withKnownBidderCount: number;
  clean: number;
  /** Comparables with contract data whose bidder count is empty, by reason. */
  unknownBidderCounts: Record<BidderCountGap, number>;
  /** Null below the minimum sample. */
  level: CompetitionLevel | null;
  /** Null below the minimum sample. */
  bidders: CompetitionBidders | null;
}

export interface CompetitionOptions {
  /** Defaults to the provisional 3. */
  thresholds?: CompetitionThresholds;
  /** Defaults to 5. */
  minSample?: number;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a whole number of at least 1, got ${value}`);
  }
  return value;
}

/** The first digest of each project: one project is one comparable, however often it is passed. */
function uniqueByProject(digests: readonly AwardDigest[]): AwardDigest[] {
  const seen = new Set<string>();
  return digests.filter((digest) => {
    if (seen.has(digest.project.projectId)) return false;
    seen.add(digest.project.projectId);
    return true;
  });
}

/**
 * The competition level of one group of comparables. The comparables are
 * the group the caller chose, each already digested. Only those with contract data
 * and a known bidder count are read; a bidder count of an award whose winner is not
 * determined still counts, because it does not depend on the winner. Below the
 * minimum sample there is no level and no statistic, only the counts.
 *
 * The level is read from the median count: "few" up to `thresholds.fewMax`, "many"
 * above it. With an even number of comparables the median can fall between two whole
 * counts (3.5 with the default boundary of 3): it is compared as it is, so 3.5 is
 * "many" and 2.5 is "few". That is the rule, not a rounding. The level describes past
 * signed awards, not the tender in hand, and open data holds signed contracts only, so
 * cancelled or unsigned tenders are absent.
 */
export function competitionLevel(
  digests: readonly AwardDigest[],
  options: CompetitionOptions = {},
): CompetitionSummary {
  const fewMax = positiveInteger(
    options.thresholds?.fewMax ?? DEFAULT_COMPETITION_THRESHOLDS.fewMax,
    'thresholds.fewMax',
  );
  const minSample = positiveInteger(options.minSample ?? COMPETITION_MIN_SAMPLE, 'minSample');

  const unique = uniqueByProject(digests);
  const past = unique.filter((digest) => digest.hasContractData);
  const counts = past.flatMap((digest) =>
    digest.bidderCount === null ? [] : [digest.bidderCount],
  );
  const unknownBidderCounts: Record<BidderCountGap, number> = {
    no_bids: 0,
    unnamed_bidder: 0,
    several_years: 0,
    year_without_contract: 0,
  };
  for (const digest of past) {
    if (digest.bidderCountGap !== null) unknownBidderCounts[digest.bidderCountGap] += 1;
  }

  const base = {
    thresholds: { fewMax, provisional: true as const },
    minSample,
    minSampleProvisional: true as const,
    duplicatesIgnored: digests.length - unique.length,
    comparables: unique.length,
    withContractData: past.length,
    withResolvedWinner: past.filter((digest) => digest.winnerStatus === 'resolved').length,
    withKnownBidderCount: counts.length,
    clean: past.filter((digest) => digest.clean).length,
    unknownBidderCounts,
  };
  if (counts.length < minSample) return { ...base, level: null, bidders: null };

  const sorted = [...counts].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const few = sorted.filter((count) => count <= fewMax).length;
  return {
    ...base,
    level: median <= fewMax ? 'few' : 'many',
    bidders: {
      min: sorted[0]!,
      median,
      max: sorted[sorted.length - 1]!,
      few,
      many: sorted.length - few,
    },
  };
}

export interface ClosestAwards {
  /** Past awards with a planned budget: every one that could be listed, not only those shown. */
  count: number;
  /** Past awards left out of the listing for want of a usable planned budget (none, NaN or infinite). */
  withoutBudget: number;
  /** True where this TOR has no usable planned budget, so nothing can be ordered against it. */
  noOwnBudget: boolean;
  /**
   * Digests of a project already given earlier in the list, left out so that it is not
   * listed twice. The first one given is kept, so a duplicate that differs from it is a
   * fault of the caller, and is reported here rather than dropped silently.
   */
  duplicatesIgnored: number;
  /**
   * At most `BUDGET_COMPARISON_MAX_PROJECTS` (10), in `compareBudget`'s order: the
   * smallest absolute budget difference first, then the later announcement, then
   * the lower project id. `difference` is the comparable's budget minus this TOR's.
   */
  listed: { digest: AwardDigest; difference: number }[];
}

/**
 * The comparables to list for #144: past awards (contract data exists) with a
 * planned budget, the ten whose budget is nearest this TOR's. The ordering, the
 * cap and the tie-breaks are `compareBudget`'s (#61), not repeated here, so the two
 * features can never order the same projects differently. A project passed twice is
 * listed once, the first digest being kept, and the duplicates are counted. A budget
 * that is not a finite number is no budget. Digests are not changed.
 */
export function closestAwardDigests(
  ownBudget: number | null,
  digests: readonly AwardDigest[],
): ClosestAwards {
  const unique = uniqueByProject(digests);
  const duplicatesIgnored = digests.length - unique.length;
  const past = unique.filter((digest) => digest.hasContractData);
  const withBudget = past.filter((digest) => usableBudget(digest.project.budget) !== null);
  const withoutBudget = past.length - withBudget.length;
  const own = usableBudget(ownBudget);
  if (own === null) {
    return {
      count: withBudget.length,
      withoutBudget,
      noOwnBudget: true,
      duplicatesIgnored,
      listed: [],
    };
  }

  const byId = new Map(withBudget.map((digest) => [digest.project.projectId, digest]));
  const candidates: BudgetCandidate[] = withBudget.map(({ project }) => ({
    projectId: project.projectId,
    projectName: project.projectName,
    deptName: project.deptName,
    budget: project.budget!,
    budgetYear: project.budgetYear,
    announceDate: project.announceDate,
  }));
  const { count, projects } = compareBudget(own, candidates);
  return {
    count,
    withoutBudget,
    noOwnBudget: false,
    duplicatesIgnored,
    listed: projects.map((comparable) => ({
      digest: byId.get(comparable.projectId)!,
      difference: comparable.difference,
    })),
  };
}
