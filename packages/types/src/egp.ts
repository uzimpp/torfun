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
 * The agency owns the truth and this system holds a reading of it, derived from
 * the project's e-GP announcement timeline (see `MilestonesSchema`), never from
 * a model. `unknown` means no timeline has been read yet, not "something went
 * wrong".
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
  unknown: 'ยังไม่ทราบสถานะ',
};

/**
 * Where a bid deadline came from, best first: the timeline's bidding date, the
 * invitation announcement, then the TOR.
 */
export const DeadlineSource = z.enum(['timeline', 'invitation', 'tor']);
export type DeadlineSource = z.infer<typeof DeadlineSource>;

/** Thai display labels for where a deadline was read from. */
export const DEADLINE_SOURCE_LABELS: Record<DeadlineSource, string> = {
  timeline: 'ไทม์ไลน์โครงการใน e-GP',
  invitation: 'ประกาศเชิญชวน',
  tor: 'เอกสาร TOR',
};

/** The stages of a tender e-GP's timeline can show, in lifecycle order. */
export const MILESTONE_KEYS = [
  'drafted',
  'invited',
  'priced',
  'evaluated',
  'awarded',
  'contracted',
] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];

/**
 * When a stage was reached, in our own vocabulary rather than e-GP's announcement
 * codes. `at` is null where the stage is known to have happened but e-GP gives no
 * date for it.
 */
const MilestoneSchema = z.object({ at: z.string().nullable() });
export type Milestone = z.infer<typeof MilestoneSchema>;

/** All six keys are always present: null means "not reached", never "absent". */
export const MilestonesSchema = z.object({
  drafted: MilestoneSchema.nullable(),
  invited: MilestoneSchema.nullable(),
  priced: MilestoneSchema.nullable(),
  evaluated: MilestoneSchema.nullable(),
  awarded: MilestoneSchema.nullable(),
  contracted: MilestoneSchema.nullable(),
});
export type Milestones = z.infer<typeof MilestonesSchema>;

export const EMPTY_MILESTONES: Milestones = {
  drafted: null,
  invited: null,
  priced: null,
  evaluated: null,
  awarded: null,
  contracted: null,
};

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
 * after the last attempt. A TOR Gemini reads as not software is not an outcome:
 * a confident answer drops the record (and tombstones it), an unsure one holds it
 * as `needs_review`.
 */
export const IngestionOutcome = z.enum([
  'queued',
  'downloading',
  'analysing',
  'tor_analysed',
  'needs_review',
  'analysis_failed',
  'no_tor_in_archive',
  'no_tor_package',
  'error',
  'abandoned',
]);
export type IngestionOutcome = z.infer<typeof IngestionOutcome>;

/**
 * Transport failures a Procurement may accumulate before it is abandoned
 * (ADR-0006). A policy, not a finding: it bounds how much of a capped Run a
 * permanently broken project can consume. Shared so the console counts against
 * the same number the pipeline enforces.
 */
export const MAX_RETRIEVAL_ATTEMPTS = 3;

/**
 * Longest one Procurement may take in a Run before it is treated as a transport
 * failure and requeued. Generous on purpose — it exists to catch a hang, not to
 * hurry a slow archive. Shared so the console flags a record as overdue at the
 * same moment the pipeline gives up on it.
 */
export const RECORD_DEADLINE_MS = 5 * 60_000;

/** Thai display labels, colocated with the enum so the UI can't drift from it. */
export const OUTCOME_LABELS: Record<IngestionOutcome, string> = {
  queued: 'รอดำเนินการ',
  downloading: 'กำลังดึงข้อมูล',
  analysing: 'กำลังประมวลผล',
  tor_analysed: 'วิเคราะห์ TOR แล้ว',
  needs_review: 'รอผู้ดูแลตรวจสอบ',
  analysis_failed: 'ได้ไฟล์ TOR แต่วิเคราะห์ไม่สำเร็จ',
  no_tor_in_archive: 'ไม่มี TOR ในไฟล์บีบอัด',
  no_tor_package: 'ไม่มีชุดเอกสาร TOR',
  error: 'ดึงข้อมูลผิดพลาด (จะลองใหม่)',
  abandoned: `ลองครบ ${MAX_RETRIEVAL_ATTEMPTS} ครั้งแล้ว`,
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
  needs_review: 'Completed',
  analysis_failed: 'Completed',
  no_tor_in_archive: 'Completed',
  no_tor_package: 'Failed',
  abandoned: 'Failed',
};

export const StatusChangeSchema = z.object({
  state: IngestionState,
  outcome: IngestionOutcome,
  at: z.string(),
  /** Present only on failures, so the admin log has the reason inline. */
  detail: z.string().optional(),
});
export type StatusChange = z.infer<typeof StatusChangeSchema>;

/**
 * How many status changes a record keeps. A record that keeps failing and being
 * retried would otherwise grow without bound; the admin log only needs the
 * recent story.
 */
export const STATUS_HISTORY_LIMIT = 50;

/** The history with `entry` added, trimmed to the last `STATUS_HISTORY_LIMIT`. */
export function appendStatusChange(
  history: readonly StatusChange[],
  entry: StatusChange,
): StatusChange[] {
  return [...history, entry].slice(-STATUS_HISTORY_LIMIT);
}

/**
 * What a document inside an announcement Archive turned out to be.
 *
 * Decided by reading the document (ADR-0003), never by matching its filename —
 * the loose filename pattern matches `CONTRACTOR.pdf` and `MONITOR_spec.pdf`,
 * and cannot tell a ร่าง from the TOR it supersedes. The two exceptions are
 * `invitation` and `bidding_document`, which e-GP names by a fixed convention
 * (`annoudoc_*`, `doc_*`) and which are read only for the bid deadline.
 */
export const DocumentRole = z.enum([
  'main_tor',
  'tor_variant',
  'not_tor',
  'unreadable',
  'invitation',
  'bidding_document',
]);
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
  /**
   * What the filename heuristic thought. Provenance and tie-breaker only;
   * `unlabelled` means nothing in the name said TOR and the model was asked anyway.
   */
  namePattern: z.enum(['canonical', 'loose', 'unlabelled']),
  role: DocumentRole,
  /** Why this document has that role, in the model's words. */
  note: z.string(),
  /**
   * How the model was given the document. Absent on records from before this was
   * kept, and means `pdf`. Anything else is a partial reading: a person should
   * check the source for what was left out.
   */
  readMode: z.enum(['pdf', 'text', 'first_pages']).optional(),
  /** For a partial reading, what was lost. */
  readNote: z.string().optional(),
});
export type ArchiveDocument = z.infer<typeof ArchiveDocumentSchema>;

/** Platforms a TOR can ask to be delivered on. Open-ended: a TOR can name a
 *  stack nobody here has seen before. */
export const TargetPlatform = z.enum(['macos', 'windows', 'mobile', 'web_app', 'other']);
export type TargetPlatform = z.infer<typeof TargetPlatform>;

/**
 * What the model concludes about a TOR, and the one thing it must show for it.
 * `isSoftware` is for the software house's own work: developing or maintaining
 * software is in; buying or repairing equipment, construction, training and the
 * like are out. `low` is the model saying it cannot tell, which is a legitimate
 * answer and is held for a person rather than guessed at.
 *
 * Only the Outcome records what was decided from this (ADR-0016), so these two
 * flags are read once, by `decideOutcome`, and never stored.
 */
export const SoftwareConfidence = z.enum(['high', 'low']);
export type SoftwareConfidence = z.infer<typeof SoftwareConfidence>;

/** Longest reason (and so quote) kept for a judgement. */
export const SOFTWARE_REASON_MAX_CHARS = 200;

export const SoftwareJudgementSchema = z.object({
  isSoftware: z.boolean(),
  confidence: SoftwareConfidence,
  /** One Thai line with a verbatim quote from the document (at most 200 characters). */
  reason: z.string().max(SOFTWARE_REASON_MAX_CHARS),
});
export type SoftwareJudgement = z.infer<typeof SoftwareJudgementSchema>;

/**
 * Why a record is held as `needs_review` instead of shown or dropped. Admin-only
 * wording: officers never see a held record.
 */
export const HoldReason = z.enum(['ai_low_confidence', 'ai_not_software_low', 'partial_read']);
export type HoldReason = z.infer<typeof HoldReason>;

export const HOLD_REASON_LABELS: Record<HoldReason, string> = {
  ai_low_confidence: 'AI ไม่มั่นใจว่าเป็นงานซอฟต์แวร์',
  ai_not_software_low: 'AI เห็นว่าไม่ใช่ซอฟต์แวร์ แต่ไม่มั่นใจ',
  partial_read: 'อ่านเอกสารได้ไม่ครบ (ไฟล์ใหญ่)',
};

/** Why a project was dropped and its record deleted. */
export const TombstoneReason = z.enum(['ai_not_software', 'admin_non_software', 'admin_deleted']);
export type TombstoneReason = z.infer<typeof TombstoneReason>;

export const TOMBSTONE_REASON_LABELS: Record<TombstoneReason, string> = {
  ai_not_software: 'AI อ่านเอกสารครบแล้วเห็นว่าไม่ใช่ซอฟต์แวร์',
  admin_non_software: 'ผู้ดูแลระบบระบุว่าไม่ใช่ซอฟต์แวร์',
  admin_deleted: 'ผู้ดูแลระบบลบและไม่ให้ดึงซ้ำ',
};

/**
 * What Discovery learned about a project from e-GP's announcement feed, kept on
 * its tombstone. The feed is read by date, so a sweep does not go back for a
 * project announced months ago; restoring one rebuilds its Queued record from
 * this instead. Nothing here was read from the TOR.
 */
export const FeedSnapshotSchema = z.object({
  projectName: z.string(),
  deptName: z.string(),
  deptCode: z.string(),
  announceDate: z.string().nullable(),
  budgetYear: z.number().int(),
  purchaseMethodName: z.string().nullable(),
});
export type FeedSnapshot = z.infer<typeof FeedSnapshotSchema>;

/**
 * What is kept of a project that was dropped, whether by the model (it read the
 * whole TOR and said, with confidence, that it is not software work) or by an
 * administrator: enough to say why, who decided and when, and what the feed
 * said about it, but nothing of what was read from the document. Its existence
 * is also what stops a later sweep from fetching the same project afresh.
 */
export const TombstoneSchema = z.object({
  projectId: z.string(),
  reason: TombstoneReason,
  /** The model's quoted passage for `ai_not_software`; whatever the administrator recorded otherwise. */
  evidence: z.string().max(SOFTWARE_REASON_MAX_CHARS),
  /** The prompt that judged it; null when no model decided. */
  promptVersion: z.string().nullable(),
  decidedAt: z.string(),
  /** The administrator who decided; null when the model did. */
  decidedBy: z.string().nullable(),
  /** The project as the feed listed it; absent on tombstones written before it was kept. */
  feed: FeedSnapshotSchema.nullish(),
});
export type Tombstone = z.infer<typeof TombstoneSchema>;

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
   * The model's one-line reason for its software judgement, with the passage it
   * quoted, so an administrator reading a held record sees what decided it.
   * Absent on analyses from before it was kept.
   */
  reason: z.string().nullish(),
  /** The prompt that produced this analysis. Absent means it predates versioning. */
  promptVersion: z.string().nullish(),
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
  deptCode: z.string(),
  /** The Thai Buddhist fiscal year the budget belongs to (2567–2569), not the announcement's year. */
  budgetYear: z.number().int(),
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
  /** Where the agency's own e-GP lifecycle has reached. `open` is biddable. Derived from `milestones`. */
  status: ProcurementStatus,
  /** The dates of the tender's stages, read from e-GP's announcement timeline. */
  milestones: MilestonesSchema,
  /** When the timeline was last read for this project; null = never. */
  timelineCheckedAt: z.string().nullable(),
  /** The bid deadline shown to officers; null when none is known. */
  deadlineAt: z.string().nullable(),
  /** Where `deadlineAt` came from; null exactly when `deadlineAt` is. */
  deadlineSource: DeadlineSource.nullable(),

  state: IngestionState,
  outcome: IngestionOutcome,
  /**
   * Transport failures so far. Derived on write so retrieval can leave out
   * exhausted records in the query itself (ADR-0006).
   */
  attempts: z.number().int().nonnegative(),
  /** Why the record is held for review; null unless `outcome` is `needs_review`. */
  holdReason: HoldReason.nullable(),
  /** The administrator who approved a held record for officers, and when; null otherwise. */
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  statusHistory: z.array(StatusChangeSchema),

  /** Handle for the announcement archive; null until the info call resolves it. */
  zipId: z.string().nullable(),
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
  /**
   * A fingerprint of everything the agency owns on this record (name, dates,
   * money, stage, winner). A sweep compares it to tell a real change from a
   * record that was merely seen again. Null on records from before it existed.
   */
  sourceHash: z.string().nullable(),
  /**
   * When anything about this record last changed: upstream data, or this
   * system's own work on it. Not bumped by a sweep that saw nothing new, so it
   * is a true "recently updated", not "recently looked at".
   */
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
    budgetYear: z.coerce.number().int().optional(),
    status: ProcurementStatus.optional(),
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
  /** Which step failed: registry resolution, discovery, timeline, info lookup, download, extract, analysis. */
  stage: z.enum(['dept', 'discovery', 'timeline', 'info', 'download', 'extract', 'analysis']),
  /**
   * `no_tor`: upstream answered that the project published no TOR (no package, or
   * an archive with none in it) — logged, but nothing to fix. `fault`: anything
   * else. Set by the pipeline when it logs the failure; one logged before this
   * field existed reads as `fault`.
   */
  kind: z.enum(['fault', 'no_tor']),
  error: z.string(),
  at: z.string(),
});
export type IngestionFailure = z.infer<typeof IngestionFailureSchema>;

/**
 * What the open-data API last said about this key's daily allowance. It is a
 * hard cap (1,000 requests a day, observed), shared by everything using the key,
 * so the pipeline plans a sweep against it and an administrator can see it.
 */
/** What a full discovery sweep costs in open-data requests (~270 queries plus lookups). For planning and display. */
export const OPEN_DATA_SWEEP_CALLS = 300;

export const OpenDataQuotaSchema = z.object({
  /** Requests left today as of `observedAt`; 0 means refused until the day turns over. */
  remainingDay: z.number().int().nonnegative(),
  limitDay: z.number().int().positive().nullable(),
  observedAt: z.string(),
});
export type OpenDataQuota = z.infer<typeof OpenDataQuotaSchema>;

export const IngestionSummarySchema = z.object({
  total: z.number().int(),
  byState: z.record(IngestionState, z.number().int()),
  byOutcome: z.record(IngestionOutcome, z.number().int()),
  byAgency: z.array(z.object({ deptName: z.string(), count: z.number().int() })),
  byYear: z.array(z.object({ budgetYear: z.number().int(), count: z.number().int() })),
  torDocumentsRetrieved: z.number().int(),
  totalTorBytes: z.number().int(),
  failureCount: z.number().int(),
  lastRunAt: z.string().nullable(),
  /** The open-data API's daily allowance as last seen; null until a sweep has read it. */
  openDataQuota: OpenDataQuotaSchema.nullable(),
  /**
   * Whether a retrieval run is executing right now. Authoritative, so the UI
   * never has to infer "still running" from the absence of Processing rows —
   * a run spends its first seconds in discovery with nothing yet Processing.
   */
  runInProgress: z.boolean(),
  /** When the Run now going began (the lease's own record of it); null when none is. */
  runStartedAt: z.string().nullable(),
  /** An administrator has asked the Run to stop; it finishes the records in flight and ends. */
  stopRequested: z.boolean(),
});
export type IngestionSummary = z.infer<typeof IngestionSummarySchema>;
