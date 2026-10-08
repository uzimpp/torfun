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

/** Thai display labels for `IngestionState` — the coarse pipeline lifecycle. */
export const STATE_LABELS: Record<IngestionState, string> = {
  Queued: 'รอคิว',
  Processing: 'กำลังดำเนินการ',
  Completed: 'เสร็จสิ้น',
  Failed: 'ไม่สำเร็จ',
};

/**
 * Where a procurement sits in the *agency's own* e-GP lifecycle — as opposed to
 * `IngestionState`, which is where it sits in ours.
 *
 * A closed set, so what an officer filters on stays clean and consistent.
 * `open` is the only stage in which a bid is possible; `drafting` is the one
 * worth most to a Business Development Officer, because it is the chance to
 * prepare before the invitation is published.
 *
 * The agency owns the truth and this system holds a reading of it: first from
 * the open-data feed, then refined by Gemini from the documents (see
 * `statusSource`). `unknown` means no reading exists yet, not "something went
 * wrong" — an unrecognised feed value is kept verbatim in `upstreamStatus`.
 */
export const ProcurementStatus = z.enum([
  'drafting',
  'open',
  'evaluating',
  'awarded',
  'contracted',
  'cancelled',
  'unknown',
]);
export type ProcurementStatus = z.infer<typeof ProcurementStatus>;

/** Thai display labels, colocated with the enum so the UI can't drift from it. */
export const STATUS_LABELS: Record<ProcurementStatus, string> = {
  drafting: 'ร่าง / เตรียมการ',
  open: 'เปิดรับข้อเสนอ',
  evaluating: 'อยู่ระหว่างพิจารณา',
  awarded: 'ประกาศผู้ชนะแล้ว',
  contracted: 'ทำสัญญาแล้ว',
  cancelled: 'ยกเลิก',
  unknown: 'ยังไม่ระบุ',
};

/** Who read a procurement's status: the open-data feed, or Gemini from the documents. */
export const StatusSource = z.enum(['upstream', 'ai']);
export type StatusSource = z.infer<typeof StatusSource>;

/**
 * A finer-grained result than `state`, kept alongside it rather than folded in.
 *
 * The distinction that matters: a project whose announcement publishes no TOR
 * package at all is a legitimate answer from the upstream system, not a
 * transport failure — but it still leaves an admin with nothing to read, so it
 * is surfaced rather than hidden. `no_tor_in_archive` is the rarer case where a
 * package exists but ships no TOR-named member.
 *
 * `downloading` and `analysing` are the two halves of Processing, so an admin
 * can tell a slow upstream from a slow model. `error` is a transport failure
 * that will be retried (the record stays Queued); `abandoned` is what it becomes
 * after the last attempt. `not_software` is Gemini's reading of the TOR, kept as
 * an outcome so the record stays visible to an admin and can be overruled.
 */
export const IngestionOutcome = z.enum([
  'queued',
  'downloading',
  'analysing',
  'tor_analysed',
  'not_software',
  'analysis_failed',
  'no_tor_in_archive',
  'no_tor_package',
  'error',
  'abandoned',
]);
export type IngestionOutcome = z.infer<typeof IngestionOutcome>;

/** Thai display labels, colocated with the enum so the UI can't drift from it. */
export const OUTCOME_LABELS: Record<IngestionOutcome, string> = {
  queued: 'รอดำเนินการ',
  downloading: 'กำลังดึงข้อมูล',
  analysing: 'กำลังประมวลผล',
  tor_analysed: 'วิเคราะห์ TOR แล้ว',
  not_software: 'AI: ไม่ใช่งานซอฟต์แวร์',
  analysis_failed: 'ได้ไฟล์ TOR แต่วิเคราะห์ไม่สำเร็จ',
  no_tor_in_archive: 'ไม่มี TOR ในไฟล์บีบอัด',
  no_tor_package: 'ไม่มีชุดเอกสาร TOR',
  error: 'ดึงข้อมูลผิดพลาด (จะลองใหม่)',
  abandoned: 'ลองครบ 3 ครั้งแล้ว',
};

/**
 * The one State each Outcome belongs to. Storing both is deliberate (State is
 * what the queue is selected and counted on), so this is what keeps the two
 * from disagreeing: a writer looks the State up here rather than choosing it.
 */
export const OUTCOME_STATE: Record<IngestionOutcome, IngestionState> = {
  queued: 'Queued',
  error: 'Queued',
  downloading: 'Processing',
  analysing: 'Processing',
  tor_analysed: 'Completed',
  not_software: 'Completed',
  analysis_failed: 'Completed',
  no_tor_in_archive: 'Completed',
  no_tor_package: 'Failed',
  abandoned: 'Failed',
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
  /** Bid submission cutoff read from the TOR, never the work delivery deadline. */
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
  /**
   * Where the work is performed, as published by the e-GP open-data row.
   * Kept as separate administrative levels so a location search can match a
   * province, district, or subdistrict without guessing from the agency name.
   */
  province: z.string().nullable(),
  district: z.string().nullable(),
  subdistrict: z.string().nullable(),
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
  /** Where the agency's own e-GP lifecycle has reached. `open` is biddable. */
  status: ProcurementStatus,
  /** Who read `status`; null while it is still `unknown`. Never present an `ai` reading as confirmed. */
  statusSource: StatusSource.nullable(),
  /**
   * The open-data feed's own `project_status`, verbatim. Kept because the feed
   * currently sends one generic value, and an unfamiliar one is what tells an
   * administrator that upstream changed.
   */
  upstreamStatus: z.string().nullable(),
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
  /**
   * Transport failures so far. Derived on write so retrieval can leave out
   * exhausted records in the query itself (ADR-0006).
   */
  attempts: z.number().int().nonnegative(),
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

/**
 * Query contract for the existing Procurement listing endpoint.
 *
 * Dates are deliberately calendar dates rather than arbitrary timestamps: the
 * search UI uses date inputs. Announcement dates are inclusive UTC days; bid
 * deadlines are inclusive calendar days in Asia/Bangkok. Multiple technology
 * terms use ALL semantics
 * so adding a term narrows a search; target platforms use ANY semantics because
 * an officer looking for either mobile or web work should see both.
 */
const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Expected a valid calendar date');

const QueryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));

const QueryList = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : value,
    z.array(item).min(1).max(20),
  );

export const ProcurementListQuerySchema = z
  .object({
    state: IngestionState.optional(),
    outcome: IngestionOutcome.optional(),
    deptName: z.string().trim().min(1).max(300).optional(),
    year: z.coerce.number().int().optional(),
    softwareClass: SoftwareClass.optional(),
    status: ProcurementStatus.optional(),
    eBidding: QueryBoolean.optional(),
    q: z.string().trim().max(200).optional(),
    minBudget: z.coerce.number().finite().nonnegative().optional(),
    maxBudget: z.coerce.number().finite().nonnegative().optional(),
    publishedFrom: CalendarDate.optional(),
    publishedTo: CalendarDate.optional(),
    deadlineFrom: CalendarDate.optional(),
    deadlineTo: CalendarDate.optional(),
    /** Relative to today's calendar day in Asia/Bangkok; only unawarded invitations. */
    deadlineDays: z.coerce.number().int().min(0).max(365).optional(),
    deadlineMode: z.enum(['within', 'exact']).optional(),
    techStack: QueryList(z.string().trim().min(1).max(100)).optional(),
    targetPlatforms: QueryList(TargetPlatform).optional(),
    /** Keyword matched against existing project and agency names, not a classification. */
    industry: z.string().trim().min(1).max(100).optional(),
    /** Keyword matched across the upstream province, district and subdistrict. */
    location: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .superRefine((query, context) => {
    const ranges: Array<[number | string | undefined, number | string | undefined, string]> = [
      [query.minBudget, query.maxBudget, 'maxBudget'],
      [query.publishedFrom, query.publishedTo, 'publishedTo'],
      [query.deadlineFrom, query.deadlineTo, 'deadlineTo'],
    ];

    if (query.deadlineDays !== undefined && (query.deadlineFrom || query.deadlineTo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadlineDays'],
        message: 'Choose a relative deadline or a calendar date range, not both',
      });
    }
    if (query.deadlineMode && query.deadlineDays === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadlineMode'],
        message: 'Deadline mode requires a day count',
      });
    }

    for (const [minimum, maximum, path] of ranges) {
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: 'Range maximum must be greater than or equal to its minimum',
        });
      }
    }
  });

export type ProcurementListQuery = z.infer<typeof ProcurementListQuerySchema>;
export type ProcurementFilters = Omit<ProcurementListQuery, 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
};

export const ProcurementListResponseSchema = z.object({
  items: z.array(ProcurementSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type ProcurementListResponse = z.infer<typeof ProcurementListResponseSchema>;

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
