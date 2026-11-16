import { z } from 'zod';

/**
 * The vendor side of a score now lives in `company.ts` as `Company` and its
 * `Experience` records. The flat `CompanyProfile` placeholder that used to sit
 * here was never imported and described the same thing differently — see
 * ADR-0009.
 *
 * Scores belong to a company, never to a procurement alone (ADR-0007).
 * This first scorer compares documented technology and platform overlap.
 * Legal qualifications, industry and delivery capacity remain unverified.
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
  companyId: z.string(),
  projectId: z.string(),
  overallScore: z.number().min(0).max(1),
  breakdown: MatchScoreBreakdownSchema,
  computedAt: z.coerce.date(),
  reasons: z.array(z.string()),
  unmatched: z.array(z.string()),
  scoringVersion: z.string(),
  inputVersion: z.string(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
