import { z } from 'zod';

/** A contract awarded for a procurement project. */
export const ContractSchema = z.object({
  projectId: z.string(),
  contractYear: z.number().int(),
  contractNo: z.string().nullable(),
  winnerName: z.string().nullable(),
  winnerTin: z.string().nullable(),
  priceAgree: z.number().nullable(),
  contractDate: z.string().nullable(),
  contractFinishDate: z.string().nullable(),
  status: z.string().nullable(),
  /**
   * Project-level figures exactly as the API publishes them, repeated on every
   * line of the project: `sumPriceAgree` is the API's own aggregate of
   * the agreed prices, not a total this system worked out or verified. Null where
   * the API gave none; absent on lines stored before these were kept.
   */
  sumPriceAgree: z.number().nullish(),
  /** The agency's budget for the project (วงเงินงบประมาณ). */
  projectMoney: z.number().nullish(),
  /** The reference price (ราคากลาง). */
  priceBuild: z.number().nullish(),
});
export type Contract = z.infer<typeof ContractSchema>;

/** A bidder's submitted price for a procurement project. */
export const ContractSubmissionSchema = z.object({
  projectId: z.string(),
  contractYear: z.number().int(),
  merchantName: z.string().nullable(),
  seqNo: z.number().int().nullable(),
  seqNoDesc: z.string().nullable(),
  submitPrice: z.number().nullable(),
});
export type ContractSubmission = z.infer<typeof ContractSubmissionSchema>;

export const ContractEnrichmentTaskStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
]);
export type ContractEnrichmentTaskStatus = z.infer<typeof ContractEnrichmentTaskStatus>;

/** Status and retry metadata for one contract-enrichment source. */
export const ContractEnrichmentTaskSchema = z.object({
  status: ContractEnrichmentTaskStatus,
  attempts: z.number().int().nonnegative(),
  lastAttemptAt: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  leaseUntil: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type ContractEnrichmentTask = z.infer<typeof ContractEnrichmentTaskSchema>;

/** Enrichment progress for a project's contract submissions. */
export const ContractEnrichmentSchema = z.object({
  projectId: z.string(),
  contractYear: z.number().int(),
  submissions: ContractEnrichmentTaskSchema,
  updatedAt: z.string(),
});
export type ContractEnrichment = z.infer<typeof ContractEnrichmentSchema>;

export const ContractSyncStatus = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ContractSyncStatus = z.infer<typeof ContractSyncStatus>;

export const ContractSyncSchema = z.object({
  year: z.number().int(),
  status: ContractSyncStatus,
  attempts: z.number().int().nonnegative(),
  lastAttemptAt: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  leaseUntil: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string(),
});
export type ContractSync = z.infer<typeof ContractSyncSchema>;

export const ContractYearQuerySchema = z.object({
  contract_year: z.coerce.number().int().positive().optional(),
});

export const ProjectContractsResponseSchema = z.object({
  items: z.array(ContractSchema),
});

export const ProjectContractSubmissionsResponseSchema = z.object({
  items: z.array(ContractSubmissionSchema),
});
