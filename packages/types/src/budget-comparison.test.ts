import { describe, expect, test } from 'bun:test';
import {
  BUDGET_COMPARISON_MAX_PROJECTS,
  BUDGET_COMPARISON_MIN_SAMPLE,
  BudgetComparisonSchema,
  compareBudget,
  type BudgetCandidate,
} from './budget-comparison';

// Fixtures only: invented projects, planned budgets in baht.
const candidate = (
  projectId: string,
  budget: number,
  overrides: Partial<BudgetCandidate> = {},
): BudgetCandidate => ({
  projectId,
  projectName: `โครงการ ${projectId}`,
  deptName: 'หน่วยงานตัวอย่าง',
  budget,
  budgetYear: 2568,
  announceDate: '2026-01-01',
  ...overrides,
});

const many = (budgets: number[]) => budgets.map((budget, i) => candidate(`p${i + 1}`, budget));

describe('compareBudget: sample size', () => {
  test('the minimum is five', () => {
    expect(BUDGET_COMPARISON_MIN_SAMPLE).toBe(5);
    expect(BUDGET_COMPARISON_MAX_PROJECTS).toBe(10);
  });

  test('exactly five comparables give a summary and a rank', () => {
    const result = compareBudget(300, many([100, 200, 400, 500, 600]));
    expect(result.count).toBe(5);
    expect(result.summary).not.toBeNull();
  });

  test('four comparables give the count and the projects but no summary and no rank', () => {
    const result = compareBudget(300, many([100, 200, 400, 500]));
    expect(result.count).toBe(4);
    expect(result.summary).toBeNull();
    expect(result.projects).toHaveLength(4);
  });

  test('none gives a zero count and nothing else', () => {
    expect(compareBudget(300, [])).toEqual({ count: 0, summary: null, projects: [] });
  });
});

describe('compareBudget: statistics and rank', () => {
  test('no ties: rank is below + 1 out of count + 1', () => {
    const { summary } = compareBudget(350, many([100, 200, 300, 400, 500]));
    expect(summary).toMatchObject({
      min: 100,
      median: 300,
      max: 500,
      position: 'within_range',
      below: 3,
      equal: 0,
      above: 2,
      rank: 4,
      rankOf: 6,
    });
  });

  test('one tie: the equal budget is neither below nor above, and the rank is not pushed down', () => {
    const { summary } = compareBudget(300, many([100, 200, 300, 400, 500]));
    expect(summary).toMatchObject({ below: 2, equal: 1, above: 2, rank: 3, rankOf: 6 });
  });

  test('several ties share one rank', () => {
    const { summary } = compareBudget(300, many([100, 300, 300, 300, 500]));
    expect(summary).toMatchObject({ below: 1, equal: 3, above: 1, rank: 2, rankOf: 6 });
  });

  test('every comparable equal: rank 1, nothing below or above, within the range', () => {
    const { summary } = compareBudget(300, many([300, 300, 300, 300, 300]));
    expect(summary).toMatchObject({
      min: 300,
      median: 300,
      max: 300,
      position: 'within_range',
      below: 0,
      equal: 5,
      above: 0,
      rank: 1,
      rankOf: 6,
    });
  });

  test('below the minimum, equal to the minimum, equal to the maximum, above the maximum', () => {
    const budgets = [100, 200, 300, 400, 500];
    expect(compareBudget(50, many(budgets)).summary).toMatchObject({
      position: 'below_range',
      below: 0,
      rank: 1,
    });
    expect(compareBudget(100, many(budgets)).summary).toMatchObject({
      position: 'within_range',
      below: 0,
      equal: 1,
      rank: 1,
    });
    expect(compareBudget(500, many(budgets)).summary).toMatchObject({
      position: 'within_range',
      below: 4,
      equal: 1,
      above: 0,
      rank: 5,
    });
    expect(compareBudget(900, many(budgets)).summary).toMatchObject({
      position: 'above_range',
      below: 5,
      above: 0,
      rank: 6,
      rankOf: 6,
    });
  });

  test('below + equal + above always equals the count', () => {
    for (const own of [0, 99, 100, 250, 300, 301, 1000]) {
      const { count, summary } = compareBudget(own, many([100, 300, 300, 100, 700, 250]));
      expect(summary!.below + summary!.equal + summary!.above).toBe(count);
    }
  });

  test('median of an even count is the mean of the two middle values', () => {
    expect(compareBudget(0, many([100, 200, 300, 400, 500, 600])).summary!.median).toBe(350);
  });

  test('duplicates among the comparables count individually, and input order does not matter', () => {
    const a = compareBudget(300, many([500, 100, 300, 100, 700]));
    const b = compareBudget(300, many([100, 100, 300, 500, 700]));
    expect(a.summary).toEqual(b.summary!);
    expect(a.summary).toMatchObject({ below: 2, equal: 1, above: 2, rank: 3 });
  });

  test('budgets are compared in whole satang, so float noise is not a difference', () => {
    const { summary } = compareBudget(0.3, many([0.1 + 0.2, 0.1, 0.5, 0.7, 0.9]));
    expect(summary).toMatchObject({ below: 1, equal: 1, above: 3, rank: 2 });
  });

  test('statistics and rank cover every eligible comparable, not the ten listed', () => {
    const budgets = Array.from({ length: 12 }, (_, i) => (i + 1) * 100);
    const result = compareBudget(650, many(budgets));
    expect(result.count).toBe(12);
    expect(result.projects).toHaveLength(10);
    expect(result.summary).toMatchObject({
      min: 100,
      max: 1200,
      median: 650,
      below: 6,
      equal: 0,
      above: 6,
      rank: 7,
      rankOf: 13,
    });
  });
});

describe('compareBudget: the listing', () => {
  test('lists the smallest absolute difference first, above and below alike', () => {
    const { projects } = compareBudget(1000, many([1_400, 900, 1_050, 700, 1_300, 2_000]));
    expect(projects.map((p) => p.projectId)).toEqual(['p3', 'p2', 'p4', 'p5', 'p1', 'p6']);
    expect(projects.map((p) => p.difference)).toEqual([50, -100, -300, 300, 400, 1000]);
  });

  test('a tie goes to the later announcement, then to the lower project id', () => {
    const { projects } = compareBudget(1000, [
      candidate('b', 1_100, { announceDate: '2026-02-01' }),
      candidate('a', 900, { announceDate: '2026-03-01' }),
      candidate('c', 1_100, { announceDate: '2026-03-01' }),
      candidate('d', 900, { announceDate: null }),
      candidate('e', 1_100, { announceDate: '2026-03-01' }),
    ]);
    expect(projects.map((p) => p.projectId)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  test('lists at most ten and keeps the ten nearest', () => {
    const budgets = Array.from({ length: 15 }, (_, i) => (i + 1) * 100);
    const { count, projects } = compareBudget(100, many(budgets));
    expect(count).toBe(15);
    expect(projects.map((p) => p.budget)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
    ]);
  });

  test('a listed project carries its planned budget as `budget`, never a price', () => {
    const [first] = compareBudget(1000, [candidate('a', 1_200)]).projects;
    expect(first).toMatchObject({ projectId: 'a', budget: 1_200, difference: 200 });
    expect(Object.keys(first!).some((key) => /price/i.test(key))).toBe(false);
  });
});

describe('BudgetComparisonSchema', () => {
  const group = {
    basis: 'agency' as const,
    criterion: 'หน่วยงานตัวอย่าง',
    ...compareBudget(300, many([100, 200, 400, 500, 600])),
  };

  test('accepts a comparison with its groups and one with no budget', () => {
    expect(
      BudgetComparisonSchema.parse({ minSample: 5, budget: 300, groups: [group] }).groups,
    ).toHaveLength(1);
    expect(
      BudgetComparisonSchema.parse({ minSample: 5, budget: null, groups: [] }).budget,
    ).toBeNull();
  });

  test('rejects more than ten listed projects and an unknown basis', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      ...candidate(`p${i}`, 100),
      difference: 0,
    }));
    expect(
      BudgetComparisonSchema.safeParse({
        minSample: 5,
        budget: 1,
        groups: [{ ...group, projects: eleven }],
      }).success,
    ).toBe(false);
    expect(
      BudgetComparisonSchema.safeParse({
        minSample: 5,
        budget: 1,
        groups: [{ ...group, basis: 'price' }],
      }).success,
    ).toBe(false);
  });
});
