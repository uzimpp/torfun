import { z } from 'zod';

/**
 * The Source Registry: the agencies a Run's Discovery reads the e-GP announcement
 * feed for (FR-09, FR-40). An agency is identified by the department id the feed
 * itself answers to (its `deptId` query parameter), which is not always the
 * open-data `dept_code` (docs/ingestion-flow.md).
 *
 * Both fields are checked here, and again by the API, because the id goes into a
 * request to the upstream site and the name into every record stored for it.
 */

/** The most agencies a registry may hold. Each costs two feed requests per day read. */
export const MAX_SOURCE_AGENCIES = 50;

/** e-GP department ids are 4 to 7 digits ("0305", "3100001"). */
export const SourceDeptIdSchema = z
  .string()
  .regex(/^\d{4,7}$/, 'Department id must be 4 to 7 digits');

export const SourceDeptNameSchema = z
  .string()
  .trim()
  .min(1, 'Agency name is required')
  .max(200)
  // No control characters: the name is shown in the console and written to logs.
  // eslint-disable-next-line no-control-regex
  .regex(/^[^\u0000-\u001f\u007f]+$/, 'Agency name must not contain control characters');

/** What an administrator supplies to add an agency. */
export const SourceAgencyInputSchema = z.object({
  deptId: SourceDeptIdSchema,
  deptName: SourceDeptNameSchema,
});
export type SourceAgencyInput = z.infer<typeof SourceAgencyInputSchema>;

/** What an administrator may change on an existing agency: its name, never its id. */
export const SourceAgencyEditSchema = z.object({ deptName: SourceDeptNameSchema });
export type SourceAgencyEdit = z.infer<typeof SourceAgencyEditSchema>;

/** An agency as the registry holds it. */
export const SourceAgencySchema = SourceAgencyInputSchema;
export type SourceAgency = z.infer<typeof SourceAgencySchema>;

export const SourceRegistryViewSchema = z.object({
  /** The agencies Discovery reads, in the order they were added. */
  items: z.array(SourceAgencySchema),
  /**
   * Agencies known to e-GP's feed that are not in the registry, offered for one
   * click add. The feed has no list endpoint, so this is the checked-in set of
   * ids already verified against it, not a live query.
   */
  available: z.array(SourceAgencySchema),
  /** True until an administrator first changes it: the registry is the built-in default. */
  isDefault: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
});
export type SourceRegistryView = z.infer<typeof SourceRegistryViewSchema>;
