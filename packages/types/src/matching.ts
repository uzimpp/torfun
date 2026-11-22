import { z } from 'zod';
import { QualificationCheckSchema } from './qualification';

/**
 * The vendor side of a score lives in `company.ts` as `Company` and its
 * `Experience` records.
 *
 * Scores belong to a company, never to a procurement alone.
 * The qualification score (`qualification-match.ts`) is the share of clauses
 * met, and 0 when any clause is not met: every bidder qualification is mandatory.
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

export const QualificationMatchResultSchema = MatchResultSchema.pick({
  projectId: true,
  computedAt: true,
}).extend({
  companyId: z.string(),
  overallScore: z.number().min(0).max(1).nullable(),
  checks: z.array(QualificationCheckSchema),
  /** The company's price-based decision rule (FR-29); null when it set no range. */
  budgetRule: QualificationCheckSchema.nullable().optional(),
});
export type QualificationMatchResult = z.infer<typeof QualificationMatchResultSchema>;
