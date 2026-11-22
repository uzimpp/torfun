import { z } from 'zod';

/**
 * Comparing a TOR's planned budget with the planned budgets of similar earlier
 * procurements TORfun has already stored (#61). Pure and local: it reads nothing
 * and knows nothing about where the candidates came from.
 *
 * `budget` here is `projectMoney`: the agency's PLANNED procurement budget
 * (วงเงินงบประมาณ), set before any tender. It is not a winning price or a
 * contract price, and nothing in this module may be named or worded as one.
 *
 * The rules, each leaving something out rather than guess:
 *  - `count` is every eligible comparable, never the number shown;
 *  - the statistics and the rank are computed over all of them;
 *  - below `BUDGET_COMPARISON_MIN_SAMPLE` comparables there is no summary and no
 *    rank, only the count and the listed projects;
 *  - at most `BUDGET_COMPARISON_MAX_PROJECTS` projects are listed, the ones whose
 *    budget differs least from this TOR's.
 */

/** Fewest comparables a group needs before any summary number is shown. */
export const BUDGET_COMPARISON_MIN_SAMPLE = 5;

/** Most projects listed per group. */
export const BUDGET_COMPARISON_MAX_PROJECTS = 10;

/** How a group is chosen: the same e-GP category, the same agency, or a shared technology. */
export const BudgetComparisonBasis = z.enum(['category', 'agency', 'tech']);
export type BudgetComparisonBasis = z.infer<typeof BudgetComparisonBasis>;

/** An eligible earlier procurement, as far as the comparison needs it. */
export interface BudgetCandidate {
  projectId: string;
  projectName: string;
  deptName: string;
  /** Planned budget in baht (`projectMoney`), never a price. */
  budget: number;
  budgetYear: number | null;
  announceDate: string | null;
}

export const BudgetComparableSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  deptName: z.string(),
  /** Planned procurement budget in baht, not a winning or contract price. */
  budget: z.number(),
  budgetYear: z.number().int().nullable(),
  announceDate: z.string().nullable(),
  /** This comparable's budget minus this TOR's, in baht; negative when it is lower. */
  difference: z.number(),
});
export type BudgetComparable = z.infer<typeof BudgetComparableSchema>;

export const BudgetPosition = z.enum(['below_range', 'within_range', 'above_range']);
export type BudgetPosition = z.infer<typeof BudgetPosition>;

export const BudgetSummarySchema = z.object({
  min: z.number(),
  median: z.number(),
  max: z.number(),
  /** `below_range` when this TOR's budget is under the minimum, `above_range` over the maximum, else within (ends included). */
  position: BudgetPosition,
  /** Comparables with a strictly lower budget than this TOR's. */
  below: z.number().int().nonnegative(),
  /** Comparables with exactly this TOR's budget. */
  equal: z.number().int().nonnegative(),
  /** Comparables with a strictly higher budget. */
  above: z.number().int().nonnegative(),
  /** `below + 1`, of `rankOf`: 1 is the lowest budget. Equal budgets share a rank. */
  rank: z.number().int().positive(),
  /** `count + 1`: the comparables and this TOR. */
  rankOf: z.number().int().positive(),
});
export type BudgetSummary = z.infer<typeof BudgetSummarySchema>;

export const BudgetComparisonGroupSchema = z.object({
  basis: BudgetComparisonBasis,
  /** What the group was matched on (a category code, an agency, technologies); null where this TOR has no such data. */
  criterion: z.string().nullable(),
  /** Every eligible comparable, not only those listed. */
  count: z.number().int().nonnegative(),
  /** Null below the minimum sample. */
  summary: BudgetSummarySchema.nullable(),
  /** At most ten, the least different from this TOR's budget first. */
  projects: z.array(BudgetComparableSchema).max(BUDGET_COMPARISON_MAX_PROJECTS),
});
export type BudgetComparisonGroup = z.infer<typeof BudgetComparisonGroupSchema>;

export const BudgetComparisonSchema = z.object({
  minSample: z.number().int().positive(),
  /** This TOR's planned budget; null means it cannot be compared and `groups` is empty. */
  budget: z.number().nullable(),
  groups: z.array(BudgetComparisonGroupSchema),
});
export type BudgetComparison = z.infer<typeof BudgetComparisonSchema>;

/** Whole satang, so float noise (0.1 + 0.2 against 0.3) never decides an equality. */
const satang = (baht: number): number => Math.round(baht * 100);

const day = (value: string | null): number => {
  const time = value === null ? Number.NaN : Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

export interface GroupComparison {
  count: number;
  summary: BudgetSummary | null;
  projects: BudgetComparable[];
}

/**
 * Compares `budget` with every eligible candidate. Callers pass ALL of them: the
 * count, the summary and the rank cover the whole set, and only the listing is cut.
 *
 * Rank: with `below` candidates strictly lower, `rank = below + 1` of `count + 1`
 * (standard competition ranking, so equal budgets share a rank and a tie never
 * moves this TOR up or down). Median: the middle value, or the mean of the two
 * middle ones for an even count. Listing: smallest absolute difference first; ties
 * go to the later announcement, then to the lower project id.
 */
export function compareBudget(
  budget: number,
  candidates: readonly BudgetCandidate[],
): GroupComparison {
  const own = satang(budget);
  const rows = candidates.map((candidate) => ({
    candidate,
    satang: satang(candidate.budget),
  }));
  const count = rows.length;

  const projects = [...rows]
    .sort(
      (a, b) =>
        Math.abs(a.satang - own) - Math.abs(b.satang - own) ||
        day(b.candidate.announceDate) - day(a.candidate.announceDate) ||
        (a.candidate.projectId < b.candidate.projectId
          ? -1
          : a.candidate.projectId > b.candidate.projectId
            ? 1
            : 0),
    )
    .slice(0, BUDGET_COMPARISON_MAX_PROJECTS)
    .map(({ candidate, satang: value }) => ({
      ...candidate,
      difference: (value - own) / 100,
    }));

  if (count < BUDGET_COMPARISON_MIN_SAMPLE) return { count, summary: null, projects };

  const sorted = rows.map((row) => row.satang).sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  const median = count % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const min = sorted[0]!;
  const max = sorted[count - 1]!;
  const below = sorted.filter((value) => value < own).length;
  const equal = sorted.filter((value) => value === own).length;

  return {
    count,
    summary: {
      min: min / 100,
      median: median / 100,
      max: max / 100,
      position: own < min ? 'below_range' : own > max ? 'above_range' : 'within_range',
      below,
      equal,
      above: count - below - equal,
      rank: below + 1,
      rankOf: count + 1,
    },
    projects,
  };
}
