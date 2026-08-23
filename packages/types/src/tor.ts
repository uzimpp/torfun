import { z } from 'zod';

/**
 * Target platform values from the feature analysis (macOS, Windows, mobile, web-app).
 * Kept as an open string union rather than a fixed catalog since a TOR can name a stack
 * we haven't seen before.
 */
export const TargetPlatform = z.enum(['macos', 'windows', 'mobile', 'web_app', 'other']);
export type TargetPlatform = z.infer<typeof TargetPlatform>;

export const TorSourceSchema = z.object({
  websiteName: z.string(),
  sourceUrl: z.string().url(),
  /** Storage key/URL for the archived PDF, so USR-07 (verify from source) survives link rot. */
  archivedDocumentUrl: z.string().url().optional(),
});
export type TorSource = z.infer<typeof TorSourceSchema>;

export const TorStatus = z.enum(['draft', 'published']);
export type TorStatus = z.infer<typeof TorStatus>;

export const TorSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Free-text AI-generated summary for USR-08. */
  summary: z.string().optional(),
  agency: z.string(),
  /** Scope is Bangkok-only per USR-03 / project scope. */
  province: z.literal('bangkok'),
  budgetThb: z.number().nonnegative().optional(),
  publishedAt: z.coerce.date(),
  deadlineAt: z.coerce.date(),
  techStack: z.array(z.string()).default([]),
  industry: z.string().optional(),
  targetPlatforms: z.array(TargetPlatform).default([]),
  source: TorSourceSchema,
  /** SHA-256 of normalized source content, used to de-duplicate per functional requirements. */
  contentHash: z.string(),
  status: TorStatus.default('draft'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Tor = z.infer<typeof TorSchema>;
