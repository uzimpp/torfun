import { z } from 'zod';

/**
 * Inputs from the "past experience" profile (USR-06/08 feature analysis) that feed
 * the matching score. Exact weighting is still an open decision — this shape
 * is the placeholder contract between the matching service and the rest of the app.
 */
export const CompanyProfileSchema = z.object({
  pastIndustries: z.array(z.string()).default([]),
  techStackExpertise: z.array(z.string()).default([]),
  preferredProjectSizeThb: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
    .optional(),
  yearsOfExperience: z.number().nonnegative().optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const MatchScoreBreakdownSchema = z.object({
  techStackScore: z.number().min(0).max(1),
  deadlineScore: z.number().min(0).max(1),
  industryScore: z.number().min(0).max(1),
  targetPlatformScore: z.number().min(0).max(1),
  decisionRulesScore: z.number().min(0).max(1),
});
export type MatchScoreBreakdown = z.infer<typeof MatchScoreBreakdownSchema>;

export const MatchResultSchema = z.object({
  torId: z.string(),
  overallScore: z.number().min(0).max(1),
  breakdown: MatchScoreBreakdownSchema,
  computedAt: z.coerce.date(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;
