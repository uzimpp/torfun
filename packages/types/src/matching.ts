import { z } from 'zod';

/**
 * The vendor side of a score now lives in `company.ts` as `Company` and its
 * `Experience` records. The flat `CompanyProfile` placeholder that used to sit
 * here was never imported and described the same thing differently — see
 * ADR-0009.
 *
 * `MatchResult` is still keyed on `projectId` alone. It needs a company key
 * before scoring is built, or one vendor's score would be shown to another;
 * that change belongs to the matching feature (ADR-0007).
 */
export const MatchScoreBreakdownSchema = z.object({
  techStackScore: z.number().min(0).max(1),
  deadlineScore: z.number().min(0).max(1),
  industryScore: z.number().min(0).max(1),
  targetPlatformScore: z.number().min(0).max(1),
  decisionRulesScore: z.number().min(0).max(1),
});
export type MatchScoreBreakdown = z.infer<typeof MatchScoreBreakdownSchema>;

export const MatchResultSchema = z.object({
  projectId: z.string(),
  overallScore: z.number().min(0).max(1),
  breakdown: MatchScoreBreakdownSchema,
  computedAt: z.coerce.date(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
