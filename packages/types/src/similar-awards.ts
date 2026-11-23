import { z } from 'zod';

/**
 * The response of #144's name-based discovery (provisional, accepted for the course MVP
 * only): similar past awards found in open data by a keyword made from a TOR's
 * name, with their winners, agreed prices and bidders, and a competition level where
 * enough bidder counts are known.
 *
 * Everything here is open data not verified by the system. A row is found by NAME: it is
 * not known to be the same kind of work, and nothing in this response says so. The
 * same-agency and e-bidding filters only cut unrelated rows; they prove neither
 * similarity nor software relevance. `budget` is the planned
 * budget, never a price; the price is `agreedPrice`, the agreed contract price.
 */

/** Most keyword searches one request may make (the current fiscal year and the two before it). */
export const SIMILAR_AWARDS_MAX_SEARCHES = 3;

/** Most bidder lookups (one per project and contract year) one request may make. */
export const SIMILAR_AWARDS_MAX_BIDDER_CALLS = 10;

/**
 * `ok`: the search ran (see `complete`); `no_keyword`: the name gives no keyword to
 * search, so nothing was asked; `cooling_down`: the open-data API is in its cooldown, so
 * nothing was asked; `not_offered`: this TOR is not one an officer may see, and the
 * feature is offered only for those.
 */
export const SimilarAwardsStatus = z.enum(['ok', 'no_keyword', 'cooling_down', 'not_offered']);
export type SimilarAwardsStatus = z.infer<typeof SimilarAwardsStatus>;

const SearchSchema = z.object({
  year: z.number().int(),
  /** How many rows the API says match; null where it was not asked or failed. */
  total: z.number().int().nonnegative().nullable(),
  read: z.number().int().nonnegative(),
  /** More rows match than the one page that was read. */
  truncated: z.boolean(),
  /** `not_asked` after an earlier search failed or the quota ran out. */
  outcome: z.enum(['read', 'failed', 'not_asked']),
});

const ExcludedSchema = z.object({
  /** The TOR's own project id: never its own comparable. */
  ownProject: z.number().int().nonnegative(),
  otherAgency: z.number().int().nonnegative(),
  notEBidding: z.number().int().nonnegative(),
  noContractLines: z.number().int().nonnegative(),
  /** The TOR has no announcement date, so nothing is "earlier" than it. */
  torUndated: z.number().int().nonnegative(),
  /** The row's own announcement date could not be read. */
  undated: z.number().int().nonnegative(),
  notEarlier: z.number().int().nonnegative(),
  malformed: z.number().int().nonnegative(),
  /** The same project and year returned by more than one search. */
  duplicates: z.number().int().nonnegative(),
});

const WinnerSchema = z.object({ name: z.string(), jointVenture: z.boolean() });

const PricesSchema = z.object({
  /** The agreed contract price, never the winner's submitted bid and never `sum_price_agree`. */
  agreedPrice: z.number().nullable(),
  agreedPriceUnusable: z.boolean(),
  /** `agreedPrice / budget`; may exceed 1 and is never capped. */
  agreedToBudget: z.number().nullable(),
  exceedsBudget: z.boolean(),
  averageBid: z.number().nullable(),
  pricedBids: z.number().int().nonnegative(),
});

const BidderCountGapSchema = z.enum([
  'no_bids',
  'unnamed_bidder',
  'several_years',
  'year_without_contract',
]);

const ListedSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  deptName: z.string(),
  /** Planned procurement budget in baht, not a price. */
  budget: z.number().nullable(),
  announceDate: z.string().nullable(),
  /** This comparable's planned budget minus this TOR's. */
  difference: z.number(),
  /** Contract fiscal years found for it, oldest first: the year each was searched for. */
  contractYears: z.array(z.number().int()),
  winnerStatus: z.enum(['none', 'resolved', 'not_determined']),
  winners: z.array(WinnerSchema),
  undeterminedAwards: z.number().int().nonnegative(),
  bidderCount: z.number().int().positive().nullable(),
  bidderCountGap: BidderCountGapSchema.nullable(),
  clean: z.boolean(),
  prices: PricesSchema.nullable(),
  /**
   * Whether its bidders were looked up: `read` (some returned), `none` (asked, nothing
   * returned, as seen for the older years in the sample), `not_asked` (the request's
   * limit was reached) or `failed`. A project is looked up for all its years or none.
   */
  bidders: z.enum(['read', 'none', 'not_asked', 'failed']),
});
export type SimilarAwardListed = z.infer<typeof ListedSchema>;

const CompetitionSchema = z.object({
  thresholds: z.object({ fewMax: z.number().int().positive(), provisional: z.literal(true) }),
  minSample: z.number().int().positive(),
  minSampleProvisional: z.literal(true),
  duplicatesIgnored: z.number().int().nonnegative(),
  comparables: z.number().int().nonnegative(),
  withContractData: z.number().int().nonnegative(),
  withResolvedWinner: z.number().int().nonnegative(),
  withKnownBidderCount: z.number().int().nonnegative(),
  clean: z.number().int().nonnegative(),
  unknownBidderCounts: z.object({
    no_bids: z.number().int().nonnegative(),
    unnamed_bidder: z.number().int().nonnegative(),
    several_years: z.number().int().nonnegative(),
    year_without_contract: z.number().int().nonnegative(),
  }),
  /** Null unless at least `minSample` comparables have a known bidder count. */
  level: z.enum(['few', 'many']).nullable(),
  bidders: z
    .object({
      min: z.number(),
      median: z.number(),
      max: z.number(),
      few: z.number().int().nonnegative(),
      many: z.number().int().nonnegative(),
    })
    .nullable(),
});

export const SimilarAwardsSchema = z.object({
  status: SimilarAwardsStatus,
  /** The keyword searched, or null where there was none. */
  keyword: z.string().nullable(),
  /** Why there is no keyword: `too_short` or `too_generic`. */
  keywordSkipped: z.enum(['too_short', 'too_generic']).nullable(),
  /** Until when the open-data API is in its cooldown, for `cooling_down`. */
  cooldownUntil: z.string().nullable(),
  /** This TOR's planned budget, which the list is ordered against. */
  ownBudget: z.number().nullable(),
  searches: z.array(SearchSchema),
  /** Rows read, and why those left out were. */
  rowsRead: z.number().int().nonnegative(),
  excluded: ExcludedSchema,
  /** Projects kept after the filters, before the listing is cut to ten. */
  projects: z.number().int().nonnegative(),
  /** Past awards with a usable planned budget, of which at most ten are listed. */
  closestCount: z.number().int().nonnegative(),
  /** Past awards left out of the list for want of a usable planned budget. */
  withoutBudget: z.number().int().nonnegative(),
  listed: z.array(ListedSchema),
  /** Bidder lookups made, of the most one request may make. */
  bidderCalls: z.object({ used: z.number().int().nonnegative(), max: z.number().int().positive() }),
  /** Read from the listed projects only, the ones whose bidders were looked up. */
  competition: CompetitionSchema.nullable(),
  /**
   * Winners named in at least two of the listed awards, counted out of the listed awards
   * with a determined winner; null where no name repeats. Exact names only.
   */
  repeatWinners: z
    .object({
      projects: z.number().int().positive(),
      winners: z.array(z.object({ name: z.string(), wins: z.number().int().min(2) })),
    })
    .nullable(),
  /** Every search and every bidder lookup was made: false where one failed or the quota ran out. */
  complete: z.boolean(),
  /** Served from this server's memory, not asked of the open-data API again. */
  cached: z.boolean(),
  /** When the search was made, as an ISO instant; null where nothing was searched. */
  fetchedAt: z.string().nullable(),
});
export type SimilarAwards = z.infer<typeof SimilarAwardsSchema>;
