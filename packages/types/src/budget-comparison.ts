import { z } from 'zod';

/**
 * A TOR's announced budget beside the budgets of similar TORs already ingested
 * (FR-25). "Similar" is a transparent overlap of the AI-extracted technology
 * stack and target platforms, so the comparison is a guide, not a valuation.
 */
export const BudgetPeerSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  deptName: z.string(),
  budget: z.number(),
  /** The technology terms and platforms this peer shares with the TOR. */
  shared: z.array(z.string()),
});
export type BudgetPeer = z.infer<typeof BudgetPeerSchema>;

export const BudgetComparisonSchema = z.object({
  projectId: z.string(),
  /** The agency's announced budget (`projectMoney`); null when it published none. */
  budget: z.number().nullable(),
  peerCount: z.number().int().nonnegative(),
  min: z.number().nullable(),
  p25: z.number().nullable(),
  median: z.number().nullable(),
  p75: z.number().nullable(),
  max: z.number().nullable(),
  /** Share of peers with a lower budget, 0–100; null without a budget or peers. */
  percentile: z.number().min(0).max(100).nullable(),
  /** The closest peers, most similar first. */
  peers: z.array(BudgetPeerSchema),
});
export type BudgetComparison = z.infer<typeof BudgetComparisonSchema>;
