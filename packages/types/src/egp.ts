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
 * Where a procurement sits in the *agency's own* e-GP lifecycle — as opposed to
 * `IngestionState`, which is where it sits in ours. Read from upstream's
 * `project_status`, never written by this system.
 *
 * `invitation` is the only stage open to a bid: before it the agency has not
 * asked for one, after it the work is awarded, contracted or dead. That is what
 * makes this worth typing rather than storing as the raw Thai string.
 *
 * `unknown` covers anything upstream sends that this list does not name — a
 * seventh stage, or a rewording. It is surfaced to an administrator rather than
 * folded into a neighbouring value.
 */
export const ProcurementStatus = z.enum([
  'drafting_tor',
  'requisition',
  'invitation',
  'award_announced',
  'contracted',
  'cancelled',
  'unknown',
]);
export type ProcurementStatus = z.infer<typeof ProcurementStatus>;

/** Human-readable labels, colocated with the enum so the UI can't drift from it. */
export const STATUS_LABELS: Record<ProcurementStatus, string> = {
  drafting_tor: 'จัดทำ TOR',
  requisition: 'รายงานขอซื้อขอจ้าง',
  invitation: 'หนังสือเชิญชวน/ประกาศเชิญชวน',
  award_announced: 'อนุมัติสั่งซื้อสั่งจ้างและประกาศผู้ชนะการเสนอราคา',
  contracted: 'จัดทำสัญญา/บริหารสัญญา',
  cancelled: 'ยกเลิกโครงการ',
  unknown: 'สถานะไม่ทราบ',
};

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
  'tor_analysed',
  'analysis_failed',
  'no_tor_in_archive',
  'no_tor_package',
  'error',
]);
export type IngestionOutcome = z.infer<typeof IngestionOutcome>;

/** Human-readable labels, colocated with the enum so the UI can't drift from it. */
export const OUTCOME_LABELS: Record<IngestionOutcome, string> = {
  queued: 'รอดำเนินการ',
  processing: 'กำลังดึงข้อมูล',
  tor_analysed: 'วิเคราะห์ TOR แล้ว',
  analysis_failed: 'ได้ไฟล์ TOR แต่วิเคราะห์ไม่สำเร็จ',
  no_tor_in_archive: 'ไม่มี TOR ในไฟล์บีบอัด',
  no_tor_package: 'ไม่มีชุดเอกสาร TOR',
  error: 'ดึงข้อมูลผิดพลาด',
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


/**
 * What a document inside an announcement Archive turned out to be.
 *
 * Decided by reading the document (ADR-0003), never by matching its filename —
 * the loose filename pattern matches `CONTRACTOR.pdf` and `MONITOR_spec.pdf`,
 * and cannot tell a ร่าง from the TOR it supersedes.
 */
export const DocumentRole = z.enum(['main_tor', 'tor_variant', 'not_tor', 'unreadable']);
export type DocumentRole = z.infer<typeof DocumentRole>;

/**
 * One document found inside an Archive. A manifest entry, not a file: the bytes
 * are never persisted (ADR-0002), so this records what was there and what it
 * was judged to be.
 */
export const ArchiveDocumentSchema = z.object({
  /** Path of the member inside the ZIP, kept for provenance. */
  member: z.string(),
  filename: z.string(),
  bytes: z.number().int().nonnegative(),
  /** What the filename heuristic thought. Provenance and tie-breaker only. */
  namePattern: z.enum(['canonical', 'loose']),
  role: DocumentRole,
  /** Why this document has that role, in the model's words. */
  note: z.string(),
});
export type ArchiveDocument = z.infer<typeof ArchiveDocumentSchema>;

/** Platforms a TOR can ask to be delivered on. Open-ended: a TOR can name a
 *  stack nobody here has seen before. */
export const TargetPlatform = z.enum(['macos', 'windows', 'mobile', 'web_app', 'other']);
export type TargetPlatform = z.infer<typeof TargetPlatform>;

/**
 * What Gemini read out of a TOR.
 *
 * A time-saving summary, never an authority: the Archive stays reachable
 * upstream so a Business Development Officer can verify before committing days
 * to a bid. `budgetThb` deliberately sits beside the agency's announced
 * `projectMoney` rather than replacing it — when the two disagree, that is
 * signal.
 */
export const TorAnalysisSchema = z.object({
  summary: z.string(),
  scopeOfWork: z.array(z.string()),
  budgetThb: z.number().nonnegative().nullable(),
  deadlineAt: z.string().nullable(),
  durationDays: z.number().int().positive().nullable(),
  techStack: z.array(z.string()),
  targetPlatforms: z.array(TargetPlatform),
  requiredQualifications: z.array(z.string()),
  /**
   * The model's read of the document, deliberately kept beside `softwareClass`'s
   * read of the title rather than overwriting it. The title heuristic is
   * directional and known to over-count; this is the human-grade second
   * opinion, and where the two disagree that is worth an officer's attention —
   * so neither is allowed to silently win.
   */
  isSoftwareProject: z.boolean(),
  confidence: z.enum(['high', 'low']),
});
export type TorAnalysis = z.infer<typeof TorAnalysisSchema>;

/**
 * The awarded contract, where one exists.
 *
 * `null` means no winner is recorded — which, in the `egp-contract` dataset, is
 * currently never: every sampled project already had one. That is the point of
 * modelling it as an award rather than as more fields on the project: whether
 * this is null is the honest answer to "can anyone still bid on it?".
 *
 * `priceAgree` lives here, not on the Procurement, because it is a property of
 * the award. `projectMoney` is what the agency budgeted, `priceBuild` is the
 * official reference price, and `analysis.budgetThb` is what the TOR document
 * claims — four different numbers, each true about something different.
 *
 * Deliberately NOT stored: the contract's own `status`, which is the same value
 * as the project's, and `sum_price_agree`, which equalled `price_agree` on
 * every project sampled.
 */
export const WinnerSchema = z.object({
  name: z.string(),
  /** The winner's 13-digit taxpayer id, for joining across projects. */
  taxId: z.string(),
  contractNo: z.string(),
  /** Thai Buddhist short dates as upstream writes them, e.g. "15 ก.ย. 68". */
  contractDate: z.string().nullable(),
  contractFinishDate: z.string().nullable(),
  /** What the work actually sold for. */
  priceAgree: z.number().nonnegative().nullable(),
});
export type Winner = z.infer<typeof WinnerSchema>;

/**
 * A procurement project discovered on the open-data API, plus everything the
 * TOR-retrieval stage has learned about it. One record per `projectId`, which
 * is the deduplication key the functional requirements call for.
 */
export const ProcurementSchema = z.object({
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
  /** What the agency budgeted for the work. */
  projectMoney: z.number().nullable(),
  /** ราคากลาง — the official reference price. Distinct from the budget, and
   *  from what the work eventually sold for. */
  priceBuild: z.number().nullable(),
  /** Where the agency's own e-GP lifecycle has reached. `invitation` is biddable. */
  status: ProcurementStatus,
  matchedKeywords: z.array(z.string()),

  softwareClass: SoftwareClass,
  softwareScore: z.number().int(),
  /**
   * Whether the tender method is competitive. This is the single best
   * predictor of TOR availability found in the POC (32/32 e-bidding projects
   * had a retrievable TOR; 0/5 direct awards did), because the TOR is an
   * attachment to a competitive announcement.
   *
   * Unlike `status`, this does NOT replace the upstream string it derives from:
   * a boolean cannot express คัดเลือก versus เฉพาะเจาะจง, so `purchaseMethodName`
   * keeps what it would otherwise throw away. `status` could drop its raw field
   * because that enum is lossless; this one is not.
   */
  eBidding: z.boolean(),

  state: IngestionState,
  outcome: IngestionOutcome,
  statusHistory: z.array(StatusChangeSchema),

  /** Handle for the announcement archive; null until the info call resolves it. */
  zipId: z.string().nullable(),
  zipBytes: z.number().int().nonnegative().nullable(),
  archiveMemberCount: z.number().int().nonnegative().nullable(),
  /**
   * Every candidate document found in the archive and what it turned out to
   * be. A manifest, not files: the bytes are never persisted (ADR-0002).
   */
  documents: z.array(ArchiveDocumentSchema),
  /** What Gemini read out of the main TOR; null until analysis succeeds. */
  analysis: TorAnalysisSchema.nullable(),
  /** The awarded contract, or null where none has been recorded. */
  winner: WinnerSchema.nullable(),
  /**
   * True where more than one document had an equal claim to being the TOR and
   * the tie was broken by convention. Surfaced so an administrator can see the
   * pipeline chose rather than meeting it in a wrong summary.
   */
  torAmbiguous: z.boolean(),

  discoveredAt: z.string(),
  updatedAt: z.string(),
});
export type Procurement = z.infer<typeof ProcurementSchema>;

/** A failed retrieval, logged for Site Administrator review. */
export const IngestionFailureSchema = z.object({
  projectId: z.string(),
  projectName: z.string().nullable(),
  /** Which step failed: registry resolution, discovery, info lookup, download, extract, analysis. */
  stage: z.enum(['dept', 'discovery', 'info', 'download', 'extract', 'analysis']),
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
  torDocumentsRetrieved: z.number().int(),
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
