import { z } from 'zod';

/**
 * Domain types for the e-GP ingestion pipeline (Thai government procurement).
 *
 * Ported from the Python POC in `scripts/` — see docs/poc_fullflow/README.md
 * for the investigation these shapes came out of. They live in the shared
 * types package because the admin UI renders the same records the API stores.
 */

/**
 * The four processing states the functional requirements name, in the order a
 * record moves through them. `Failed` is terminal only until an admin retries.
 */
export const IngestionState = z.enum(['Queued', 'Processing', 'Completed', 'Failed']);
export type IngestionState = z.infer<typeof IngestionState>;

/**
 * A finer-grained result than `state`, kept alongside it rather than folded in.
 *
 * The distinction that matters: a project whose announcement publishes no TOR
 * package at all is a legitimate answer from the upstream system, not a
 * transport failure — but it still leaves an admin with nothing to read, so it
 * is surfaced rather than hidden. `no_tor_in_archive` is the rarer case where a
 * package exists but ships no TOR-named member.
 */
export const IngestionOutcome = z.enum([
  'queued',
  'processing',
  'tor_downloaded',
  'no_tor_in_archive',
  'no_tor_package',
  'error',
]);
export type IngestionOutcome = z.infer<typeof IngestionOutcome>;

/** Human-readable labels, colocated with the enum so the UI can't drift from it. */
export const OUTCOME_LABELS: Record<IngestionOutcome, string> = {
  queued: 'Queued',
  processing: 'Processing',
  tor_downloaded: 'TOR downloaded',
  no_tor_in_archive: 'Archive has no TOR',
  no_tor_package: 'No TOR package published',
  error: 'Retrieval error',
};

/**
 * How a project title was bucketed by the title heuristic. This is a
 * heuristic over Thai project names, not an authoritative upstream field —
 * directionally useful for triage, not precise enough to quote as a statistic.
 */
export const SoftwareClass = z.enum(['new_build', 'oandm', 'not_software']);
export type SoftwareClass = z.infer<typeof SoftwareClass>;

export const StatusChangeSchema = z.object({
  state: IngestionState,
  outcome: IngestionOutcome,
  at: z.string(),
  /** Present only on failures, so the admin log has the reason inline. */
  detail: z.string().optional(),
});
export type StatusChange = z.infer<typeof StatusChangeSchema>;

/** One TOR PDF extracted from a project's announcement archive. */
export const TorFileSchema = z.object({
  /** Path of the member inside the ZIP, kept for provenance. */
  member: z.string(),
  filename: z.string(),
  bytes: z.number().int().nonnegative(),
  /** False means the bytes are not actually a PDF, whatever the extension says. */
  pdfMagicOk: z.boolean(),
  /**
   * `canonical` = matched Attach_TOR_*.pdf; `loose` = matched some other
   * *TOR*.pdf. Recorded so an admin can tell a convention-following archive
   * from an odd one (BMA ships a bare TOR.pdf).
   */
  namePattern: z.enum(['canonical', 'loose']),
});
export type TorFile = z.infer<typeof TorFileSchema>;

/**
 * A procurement project discovered on the open-data API, plus everything the
 * TOR-retrieval stage has learned about it. One record per `projectId`, which
 * is the deduplication key the functional requirements call for.
 */
export const IngestionRecordSchema = z.object({
  projectId: z.string(),
  projectName: z.string(),
  /** The agency's own name for itself, as returned upstream. */
  deptName: z.string(),
  deptSubName: z.string().nullable(),
  /** The Source Registry entry this record was collected under. */
  registryName: z.string(),
  deptCode: z.string(),
  /** Thai Buddhist fiscal year (2567–2569). */
  year: z.number().int(),
  announceDate: z.string().nullable(),
  /** WHAT is bought: ซื้อ / จ้างทำของ / เช่า / จ้างก่อสร้าง / จ้างที่ปรึกษา. */
  projectTypeName: z.string().nullable(),
  /** HOW it is tendered: e-bidding / คัดเลือก / เฉพาะเจาะจง. */
  purchaseMethodName: z.string().nullable(),
  projectMoney: z.number().nullable(),
  projectStatus: z.string().nullable(),
  matchedKeywords: z.array(z.string()),

  softwareClass: SoftwareClass,
  softwareScore: z.number().int(),
  /**
   * Whether the tender method is competitive. This is the single best
   * predictor of TOR availability found in the POC (32/32 e-bidding projects
   * had a retrievable TOR; 0/5 direct awards did), because the TOR is an
   * attachment to a competitive announcement.
   */
  eBidding: z.boolean(),

  state: IngestionState,
  outcome: IngestionOutcome,
  statusHistory: z.array(StatusChangeSchema),

  /** Handle for the announcement archive; null until the info call resolves it. */
  zipId: z.string().nullable(),
  zipBytes: z.number().int().nonnegative().nullable(),
  archiveMemberCount: z.number().int().nonnegative().nullable(),
  torFiles: z.array(TorFileSchema),
  error: z.string().nullable(),

  discoveredAt: z.string(),
  updatedAt: z.string(),
});
export type IngestionRecord = z.infer<typeof IngestionRecordSchema>;

/** A failed retrieval, logged for Site Administrator review. */
export const IngestionFailureSchema = z.object({
  projectId: z.string(),
  projectName: z.string().nullable(),
  /** Which step failed: registry resolution, discovery, info lookup, download, extract. */
  stage: z.enum(['dept', 'discovery', 'info', 'download', 'extract']),
  error: z.string(),
  at: z.string(),
});
export type IngestionFailure = z.infer<typeof IngestionFailureSchema>;

export const IngestionSummarySchema = z.object({
  total: z.number().int(),
  byState: z.record(IngestionState, z.number().int()),
  byOutcome: z.record(IngestionOutcome, z.number().int()),
  byAgency: z.array(z.object({ deptName: z.string(), count: z.number().int() })),
  byYear: z.array(z.object({ year: z.number().int(), count: z.number().int() })),
  torFilesRetrieved: z.number().int(),
  totalTorBytes: z.number().int(),
  failureCount: z.number().int(),
  lastRunAt: z.string().nullable(),
  /**
   * Whether a retrieval run is executing right now. Authoritative, so the UI
   * never has to infer "still running" from the absence of Processing rows —
   * a run spends its first seconds in discovery with nothing yet Processing.
   */
  runInProgress: z.boolean(),
});
export type IngestionSummary = z.infer<typeof IngestionSummarySchema>;
