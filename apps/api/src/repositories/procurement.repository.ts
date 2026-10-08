import type { AnyBulkWriteOperation, Collection, Db } from 'mongodb';
import type {
  ArchiveDocument,
  DailyDiscovered,
  DailyThroughput,
  HoldReason,
  IngestionFailure,
  IngestionOutcome,
  IngestionState,
  IngestionStats,
  IngestionSummary,
  OpenDataQuota,
  Procurement,
  ProcurementStatus,
  StatusChange,
  DeadlineSource,
  Milestones,
  TargetPlatform,
  TorAnalysis,
  Tombstone,
  TombstoneReason,
  Winner,
} from '@torfun/types';
import { appendStatusChange, EMPTY_MILESTONES, OUTCOME_STATE } from '@torfun/types';
import { mergeDiscovered } from './merge-discovered';
import { hashSource, hasUpstreamChange } from './source-hash';
import { INGESTION_META_COLLECTION } from './ingestion-meta';

/**
 * Data access for ingested procurement records.
 *
 * This layer owns the only mapping between the stored documents and the
 * `Procurement` defined in `@torfun/types`. Nothing above it sees a snake_case
 * field.
 *
 * The store is filled only by an ingestion run — nothing is seeded — so what an
 * administrator sees is only ever what the pipeline actually retrieved.
 */

/**
 * Values this system stored before the status and outcome vocabulary changed.
 *
 * Read as their new equivalents so a record written before the migration ran
 * (`docs/migrations/2026-09-30-status-outcome-vocabulary.js`) is served rather
 * than failing the whole response it appears in — the API validates every
 * response against the schema, so one stale value would 500 a page or the
 * summary. The migration rewrites them for good; this only covers the gap
 * between deploying the code and running it.
 */
const LEGACY_OUTCOMES: Record<string, IngestionOutcome> = { processing: 'downloading' };
const LEGACY_STATUSES: Record<string, ProcurementStatus> = {
  drafting_tor: 'drafting',
  requisition: 'drafting',
  invitation: 'open',
  award_announced: 'awarded',
};

function outcomeFromStored(stored: string): IngestionOutcome {
  return LEGACY_OUTCOMES[stored] ?? (stored as IngestionOutcome);
}

function statusFromStored(stored: string): ProcurementStatus {
  return LEGACY_STATUSES[stored] ?? (stored as ProcurementStatus);
}

/**
 * Persistence shape. snake_case matches the documents in Atlas; this type must
 * not escape the repository.
 */
interface ProcurementDocument {
  _id: string; // the upstream projectId — a natural key, so no ObjectId
  project_name: string;
  dept_name: string;
  dept_sub_name: string | null;
  province?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  dept_code: string;
  budget_year: number;
  announce_date: string | null;
  project_type_name: string | null;
  purchase_method_name: string | null;
  project_money: number | null;
  price_build: number | null;
  status: ProcurementStatus;
  /** Absent on records written before the timeline was read. */
  milestones?: Milestones;
  timeline_checked_at?: string | null;
  /** Absent on records written before the deadline was kept. */
  deadline_at?: string | null;
  deadline_source?: DeadlineSource | null;
  state: IngestionState;
  outcome: IngestionOutcome;
  /** Absent on records written before retries were counted. */
  attempts?: number;
  /** Why the record is held for review; absent unless its outcome is `needs_review`. */
  hold_reason?: HoldReason | null;
  /** Who approved a held record, and when; absent until an administrator does. */
  approved_by?: string | null;
  approved_at?: string | null;
  status_history: StatusChange[];
  zip_id: string | null;
  documents: ArchiveDocument[];
  analysis: TorAnalysis | null;
  winner: Winner | null;
  tor_ambiguous: boolean;
  discovered_at: string;
  /** Absent on records written before sweeps were fingerprinted. */
  source_hash?: string | null;
  updated_at: string;
}

/**
 * A hold reason only means something while a record is held, so it is derived
 * from the outcome the way `state` is: set by the transition into
 * `needs_review`, and cleared by any transition out of it.
 */
export function holdReasonFor(
  outcome: IngestionOutcome,
  patch: Partial<Procurement>,
): HoldReason | null {
  return outcome === 'needs_review' ? (patch.holdReason ?? null) : null;
}

function toDomain(document: ProcurementDocument): Procurement {
  return {
    projectId: document._id,
    projectName: document.project_name,
    deptName: document.dept_name,
    deptSubName: document.dept_sub_name,
    // Older records predate location ingestion. Unknown is represented as
    // null until a real discovery run refreshes the upstream-owned fields.
    province: document.province ?? null,
    district: document.district ?? null,
    subdistrict: document.subdistrict ?? null,
    deptCode: document.dept_code,
    budgetYear: document.budget_year,
    announceDate: document.announce_date,
    projectTypeName: document.project_type_name,
    purchaseMethodName: document.purchase_method_name,
    projectMoney: document.project_money,
    priceBuild: document.price_build,
    status: statusFromStored(document.status),
    milestones: document.milestones ?? EMPTY_MILESTONES,
    timelineCheckedAt: document.timeline_checked_at ?? null,
    deadlineAt: document.deadline_at ?? null,
    deadlineSource: document.deadline_source ?? null,
    state: document.state,
    outcome: outcomeFromStored(document.outcome),
    attempts: document.attempts ?? 0,
    holdReason: document.hold_reason ?? null,
    approvedBy: document.approved_by ?? null,
    approvedAt: document.approved_at ?? null,
    statusHistory: document.status_history.map((entry) => ({
      ...entry,
      outcome: outcomeFromStored(entry.outcome),
    })),
    zipId: document.zip_id,
    documents: document.documents,
    analysis: document.analysis,
    winner: document.winner,
    torAmbiguous: document.tor_ambiguous,
    discoveredAt: document.discovered_at,
    sourceHash: document.source_hash ?? null,
    updatedAt: document.updated_at,
  };
}

function toDocument(record: Procurement): ProcurementDocument {
  return {
    _id: record.projectId,
    project_name: record.projectName,
    dept_name: record.deptName,
    dept_sub_name: record.deptSubName,
    province: record.province,
    district: record.district,
    subdistrict: record.subdistrict,
    dept_code: record.deptCode,
    budget_year: record.budgetYear,
    announce_date: record.announceDate,
    project_type_name: record.projectTypeName,
    purchase_method_name: record.purchaseMethodName,
    project_money: record.projectMoney,
    price_build: record.priceBuild,
    status: record.status,
    milestones: record.milestones,
    timeline_checked_at: record.timelineCheckedAt,
    deadline_at: record.deadlineAt,
    deadline_source: record.deadlineSource,
    state: record.state,
    outcome: record.outcome,
    attempts: record.attempts,
    hold_reason: record.holdReason,
    approved_by: record.approvedBy,
    approved_at: record.approvedAt,
    status_history: record.statusHistory,
    zip_id: record.zipId,
    documents: record.documents,
    analysis: record.analysis,
    winner: record.winner,
    tor_ambiguous: record.torAmbiguous,
    discovered_at: record.discoveredAt,
    source_hash: record.sourceHash,
    updated_at: record.updatedAt,
  };
}

export interface FindOptions {
  state?: IngestionState;
  outcome?: IngestionOutcome;
  /**
   * Only records that have failed fewer than this many times. Retrieval uses it
   * to leave exhausted records out of the query itself.
   */
  attemptsBelow?: number;
  deptName?: string;
  budgetYear?: number;
  /** Filter to one stage of the agency's own lifecycle. */
  status?: ProcurementStatus;
  /** Case-insensitive substring over project name and id. */
  query?: string;
  minBudget?: number;
  maxBudget?: number;
  publishedFrom?: string;
  publishedTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  deadlineDays?: number;
  deadlineMode?: 'within' | 'exact';
  /** Service policy for upcoming deadlines, never applied to the discovery queue. */
  excludeAwarded?: boolean;
  /** Every term must occur in at least one entry of analysis.techStack. */
  techStack?: string[];
  /** At least one selected platform must occur in analysis.targetPlatforms. */
  targetPlatforms?: TargetPlatform[];
  /** Keyword over existing names only; this is not an authoritative classification. */
  industry?: string;
  /** Case-insensitive keyword over the upstream administrative location. */
  location?: string;
  /**
   * `announced` (the default): newest announcement first. `urgency`: a tender
   * still `open` first, nearest deadline first and undated after; then
   * `unknown`; then drafting, evaluating and cancelled; awarded and contracted
   * last. Within a rank, newest announcement first.
   */
  order?: 'announced' | 'urgency';
  limit: number;
  offset: number;
}

/** What one sweep did to the store. */
export interface UpsertSummary {
  created: number;
  /** Seen before, and the agency's data for it is different now. */
  changed: number;
  /** Seen before, and nothing the agency owns moved. */
  unchanged: number;
}

export interface FindResult {
  items: Procurement[];
  total: number;
}

/**
 * The slice of this repository the ingestion pipeline needs.
 *
 * The pipeline depends on this rather than the class, so a run can be driven
 * in a test without a database — and so the pipeline cannot quietly start
 * using a query it has no business issuing.
 */
export interface ProcurementStore {
  get(projectId: string): Promise<Procurement | undefined>;
  upsert(record: Procurement): Promise<Procurement>;
  /**
   * Replace a record with its tombstone: the record and everything read from it
   * go, and the project is remembered as dropped, so no later sweep stores it.
   */
  tombstone(tombstone: Tombstone): Promise<void>;
  /** Delete a record and leave nothing behind. False where there was none. */
  remove(projectId: string): Promise<boolean>;
  /** Which of these projects were dropped; used to keep them out of a sweep. */
  tombstonedIds(projectIds: string[]): Promise<Set<string>>;
  listTombstones(): Promise<Tombstone[]>;
  /**
   * Forget a tombstone, so the next sweep that finds the project stores it and
   * retrieval reads it afresh. False where there was none.
   */
  removeTombstone(projectId: string): Promise<boolean>;
  /** What a sweep writes: every discovered record at once, reporting what was new and what moved. */
  upsertMany(records: Procurement[]): Promise<UpsertSummary>;
  /**
   * Move a record to an Outcome. The State is not an argument: it is looked up
   * from `OUTCOME_STATE`, so the two fields cannot be written out of step.
   */
  transition(
    projectId: string,
    outcome: IngestionOutcome,
    patch?: Partial<Procurement>,
    detail?: string,
  ): Promise<Procurement | undefined>;
  find(options: FindOptions): Promise<FindResult>;
  /**
   * Write fields onto a record without moving it to another Outcome. `updatedAt`
   * moves only when `touch` says something about the record changed, so a
   * timeline read that found nothing new does not look like news.
   */
  amend(
    projectId: string,
    patch: Partial<Procurement>,
    touch: boolean,
  ): Promise<Procurement | undefined>;
  /**
   * One page of the records whose timeline is due a fresh read: those already
   * read (not Queued or Processing) and not yet contracted, the longest
   * unchecked first. A contracted project is final and never comes back.
   */
  dueForTimeline(page: { limit: number; offset: number }): Promise<Procurement[]>;
  /**
   * Return records stuck in Processing to the queue.
   *
   * A record is stuck when its last status change is older than `cutoff` (an ISO
   * timestamp): the run that was working on it died or hung, and nothing else
   * will ever pick it up, because retrieval selects only Queued. Not an
   * attempt — the record did nothing wrong. Returns how many were requeued.
   */
  requeueStale(cutoff: string): Promise<number>;
  recordFailures(failures: IngestionFailure[]): Promise<void>;
  markRun(at: string): Promise<void>;
  /** The open-data API's daily allowance as last read, or null if never read. */
  openDataQuota(): Promise<OpenDataQuota | null>;
  recordOpenDataQuota(quota: OpenDataQuota): Promise<void>;
  /** When discovery last completed a sweep, or null if it never has. */
  lastDiscoveryAt(): Promise<string | null>;
}

/**
 * The distinct agency names already ingested, read by the Client suggestion
 * endpoint so a vendor's spelling of a government body matches what the
 * tenders say. Upstream open data, so nothing here exposes another vendor.
 */
export interface AgencyNameSource {
  agencies(): Promise<string[]>;
}

/** Stored history the operations view reads. */
export interface IngestionStatsSource {
  /** Over the `days` Asia/Bangkok days ending on the one `now` falls in. */
  stats(now: string, days: number): Promise<IngestionStats>;
}

/** All Procurement reads used above the persistence layer. */
export interface ProcurementDataSource extends ProcurementStore, AgencyNameSource {
  ensureIndexes(): Promise<void>;
  summary(): Promise<IngestionSummary>;
  /** The most recently updated procurements, newest first. */
  recent(limit: number): Promise<Procurement[]>;
  listFailures(): Promise<IngestionFailure[]>;
}

const QUOTA_ID = 'open_data_quota';

/** The persistence shape of a Tombstone; snake_case like the rest of what is in Atlas. */
interface TombstoneDocument {
  _id: string;
  reason: TombstoneReason;
  evidence: string;
  prompt_version: string | null;
  decided_at: string;
  decided_by: string | null;
}

interface QuotaDocument {
  _id: string;
  remaining_day: number;
  limit_day: number | null;
  observed_at: string;
}

/** `kind` is absent on failures logged before it existed. */
interface FailureDocument extends Omit<IngestionFailure, 'kind'> {
  _id?: unknown;
  kind?: IngestionFailure['kind'];
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function bangkokDate(at: string): string {
  return new Date(Date.parse(at) + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** The window's days, oldest first, and the instant the first one began. */
function bangkokWindow(now: string, days: number): { since: string; dates: string[] } {
  const lastMidnight = Date.parse(`${bangkokDate(now)}T00:00:00.000Z`);
  const dates = Array.from({ length: days }, (_, index) =>
    new Date(lastMidnight - (days - 1 - index) * DAY_MS).toISOString().slice(0, 10),
  );
  const since = new Date(lastMidnight - (days - 1) * DAY_MS - BANGKOK_OFFSET_MS).toISOString();
  return { since, dates };
}

/** Where the record's last pass through retrieval ended: the first end after its last `downloading`. */
function lastPassEnd(history: readonly StatusChange[]): StatusChange | null {
  let start = history.length - 1;
  while (start >= 0 && history[start]?.outcome !== 'downloading') start -= 1;
  if (start === -1) return null;
  for (const entry of history.slice(start + 1)) {
    if (entry.state === 'Completed' || entry.state === 'Failed') return entry;
    if (entry.outcome !== 'analysing') return null;
  }
  return null;
}

const THROUGHPUT_BUCKET: Partial<Record<IngestionOutcome, keyof Omit<DailyThroughput, 'date'>>> = {
  tor_analysed: 'completed',
  needs_review: 'held',
  analysis_failed: 'failed',
  abandoned: 'failed',
};

function throughputOf(ends: StatusChange[], dates: string[]): DailyThroughput[] {
  const byDay = new Map(dates.map((date) => [date, { date, completed: 0, held: 0, failed: 0 }]));
  for (const end of ends) {
    const bucket = THROUGHPUT_BUCKET[outcomeFromStored(end.outcome)];
    const day = byDay.get(bangkokDate(end.at));
    if (bucket && day) day[bucket] += 1;
  }
  return [...byDay.values()];
}

export class ProcurementRepository
  implements ProcurementStore, AgencyNameSource, IngestionStatsSource
{
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ProcurementDocument>> {
    return (await this.getDb()).collection<ProcurementDocument>('procurements');
  }

  private async failuresCollection(): Promise<Collection<FailureDocument>> {
    return (await this.getDb()).collection<FailureDocument>('ingestion_failures');
  }

  private async quotaDocuments(): Promise<Collection<QuotaDocument>> {
    return (await this.getDb()).collection<QuotaDocument>(INGESTION_META_COLLECTION);
  }

  private async meta(): Promise<Collection<{ _id: string; at: string }>> {
    return (await this.getDb()).collection<{ _id: string; at: string }>(INGESTION_META_COLLECTION);
  }

  /**
   * Create the indexes the queue's ordering depends on.
   *
   * Idempotent, so it is safe to call on every boot. Without the compound index
   * the retrieval sort is a collection scan on every run.
   */
  async ensureIndexes(): Promise<void> {
    await (
      await this.records()
    ).createIndexes([
      {
        key: { state: 1, announce_date: -1, _id: 1 },
      },
      { key: { dept_name: 1 } },
      { key: { budget_year: 1 } },
      // What the operations view reads: records that finished recently.
      { key: { state: 1, updated_at: -1 } },
      { key: { discovered_at: -1 } },
    ]);
    await (await this.failuresCollection()).createIndex({ at: -1 });
  }

  private async tombstoneCollection(): Promise<Collection<TombstoneDocument>> {
    return (await this.getDb()).collection<TombstoneDocument>('tombstones');
  }

  async tombstone(tombstone: Tombstone): Promise<void> {
    const document: TombstoneDocument = {
      _id: tombstone.projectId,
      reason: tombstone.reason,
      evidence: tombstone.evidence,
      prompt_version: tombstone.promptVersion,
      decided_at: tombstone.decidedAt,
      decided_by: tombstone.decidedBy,
    };
    // The tombstone first: if the delete then failed, the record would still be
    // there to be tried again, never gone without a trace of why.
    await (
      await this.tombstoneCollection()
    ).replaceOne({ _id: document._id }, document, {
      upsert: true,
    });
    await (await this.records()).deleteOne({ _id: tombstone.projectId });
  }

  async remove(projectId: string): Promise<boolean> {
    const result = await (await this.records()).deleteOne({ _id: projectId });
    return result.deletedCount === 1;
  }

  async tombstonedIds(projectIds: string[]): Promise<Set<string>> {
    if (projectIds.length === 0) return new Set();
    const found = await (
      await this.tombstoneCollection()
    )
      .find({ _id: { $in: projectIds } }, { projection: { _id: 1 } })
      .toArray();
    return new Set(found.map((document) => document._id));
  }

  async listTombstones(): Promise<Tombstone[]> {
    const documents = await (
      await this.tombstoneCollection()
    )
      .find({})
      .sort({ decided_at: -1 })
      .toArray();
    return documents.map((document) => ({
      projectId: document._id,
      reason: document.reason,
      evidence: document.evidence,
      promptVersion: document.prompt_version,
      decidedAt: document.decided_at,
      decidedBy: document.decided_by ?? null,
    }));
  }

  async removeTombstone(projectId: string): Promise<boolean> {
    const result = await (await this.tombstoneCollection()).deleteOne({ _id: projectId });
    return result.deletedCount === 1;
  }

  /**
   * Insert or merge a discovered record.
   *
   * Deduplication is by projectId, per the functional requirements. What
   * survives a rediscovery is `mergeDiscovered`'s decision, not this method's:
   * upstream fields refresh, the pipeline's own findings are preserved.
   */
  async upsert(record: Procurement): Promise<Procurement> {
    const collection = await this.records();
    const existing = await collection.findOne({ _id: record.projectId });

    if (!existing) {
      const document = toDocument({
        ...record,
        sourceHash: record.sourceHash ?? hashSource(record),
      });
      await collection.insertOne(document);
      return toDomain(document);
    }

    const merged = toDocument(mergeDiscovered(toDomain(existing), record));
    await collection.replaceOne({ _id: record.projectId }, merged);
    return toDomain(merged);
  }

  async upsertMany(records: Procurement[]): Promise<UpsertSummary> {
    const summary: UpsertSummary = { created: 0, changed: 0, unchanged: 0 };
    if (records.length === 0) return summary;

    const collection = await this.records();
    // One read for the whole sweep, not one per record.
    const stored = new Map(
      (await collection.find({ _id: { $in: records.map((r) => r.projectId) } }).toArray()).map(
        (document) => [document._id, document],
      ),
    );

    const operations: AnyBulkWriteOperation<ProcurementDocument>[] = [];
    for (const record of records) {
      const existing = stored.get(record.projectId);
      if (!existing) {
        summary.created += 1;
        operations.push({
          insertOne: {
            document: toDocument({
              ...record,
              sourceHash: record.sourceHash ?? hashSource(record),
            }),
          },
        });
        continue;
      }

      const current = toDomain(existing);
      if (hasUpstreamChange(current, record)) summary.changed += 1;
      else summary.unchanged += 1;
      operations.push({
        replaceOne: {
          filter: { _id: record.projectId },
          replacement: toDocument(mergeDiscovered(current, record)),
        },
      });
    }

    // Unordered: one bad document must not stop the rest of a sweep being stored.
    await collection.bulkWrite(operations, { ordered: false });
    return summary;
  }

  async transition(
    projectId: string,
    outcome: IngestionOutcome,
    patch: Partial<Procurement> = {},
    detail?: string,
  ): Promise<Procurement | undefined> {
    const collection = await this.records();
    const existing = await collection.findOne({ _id: projectId });
    if (!existing) return undefined;

    const state = OUTCOME_STATE[outcome];

    const at = new Date().toISOString();
    // `detail` is spread in only when present: the Mongo driver serialises an
    // `undefined` object property as BSON null rather than omitting the key,
    // so `{ ..., detail }` on the far more common no-detail transition would
    // write a literal null on every call — which `StatusChangeSchema.detail`
    // (an optional string) then rejects on the way back out.
    const entry = { state, outcome, at, ...(detail !== undefined ? { detail } : {}) };
    const updated: ProcurementDocument = {
      ...toDocument({ ...toDomain(existing), ...patch }),
      state,
      outcome,
      hold_reason: holdReasonFor(outcome, patch),
      status_history: appendStatusChange(existing.status_history, entry),
      updated_at: at,
    };
    await collection.replaceOne({ _id: projectId }, updated);
    return toDomain(updated);
  }

  async amend(
    projectId: string,
    patch: Partial<Procurement>,
    touch: boolean,
  ): Promise<Procurement | undefined> {
    const collection = await this.records();
    const existing = await collection.findOne({ _id: projectId });
    if (!existing) return undefined;

    const updated = toDocument({
      ...toDomain(existing),
      ...patch,
      updatedAt: touch ? new Date().toISOString() : existing.updated_at,
    });
    await collection.replaceOne({ _id: projectId }, updated);
    return toDomain(updated);
  }

  async dueForTimeline(page: { limit: number; offset: number }): Promise<Procurement[]> {
    const documents = await (
      await this.records()
    )
      .find({ state: { $in: ['Completed', 'Failed'] }, status: { $ne: 'contracted' } })
      // Never checked sorts first, since a missing field sorts as null.
      .sort({ timeline_checked_at: 1, _id: 1 })
      .skip(page.offset)
      .limit(page.limit)
      .toArray();
    return documents.map(toDomain);
  }

  async requeueStale(cutoff: string): Promise<number> {
    const collection = await this.records();
    // Timestamps are `toISOString()` output throughout, so string order is time
    // order. A record with no history falls back to when it was last written.
    const stale = await collection
      .find({
        state: 'Processing',
        $expr: {
          $lt: [{ $ifNull: [{ $arrayElemAt: ['$status_history.at', -1] }, '$updated_at'] }, cutoff],
        },
      })
      .toArray();

    for (const document of stale) {
      const since = document.status_history.at(-1)?.at ?? document.updated_at;
      await this.transition(
        document._id,
        'queued',
        {},
        `Requeued: stuck in Processing since ${since} with no progress.`,
      );
    }
    return stale.length;
  }

  async get(projectId: string): Promise<Procurement | undefined> {
    const document = await (await this.records()).findOne({ _id: projectId });
    return document ? toDomain(document) : undefined;
  }

  async find(options: FindOptions): Promise<FindResult> {
    const filter: Record<string, unknown> = {};
    const clauses: Record<string, unknown>[] = [];
    if (options.state) filter.state = options.state;
    if (options.outcome) filter.outcome = options.outcome;
    if (options.attemptsBelow !== undefined) {
      // A record written before attempts were counted has no field, which `$lt`
      // alone would not match; it has failed zero times.
      clauses.push({
        $or: [{ attempts: { $exists: false } }, { attempts: { $lt: options.attemptsBelow } }],
      });
    }
    if (options.deptName) filter.dept_name = options.deptName;
    if (options.budgetYear) filter.budget_year = options.budgetYear;
    if (options.status) filter.status = options.status;
    if (options.excludeAwarded) filter.winner = null;
    if (options.minBudget !== undefined || options.maxBudget !== undefined) {
      filter.project_money = {
        ...(options.minBudget !== undefined ? { $gte: options.minBudget } : {}),
        ...(options.maxBudget !== undefined ? { $lte: options.maxBudget } : {}),
      };
    }
    if (options.query?.trim()) {
      clauses.push(regexAny(['project_name', '_id', 'dept_name', 'dept_sub_name'], options.query));
    }
    if (options.industry?.trim()) {
      clauses.push(regexAny(['project_name', 'dept_name', 'dept_sub_name'], options.industry));
    }
    if (options.location?.trim()) {
      clauses.push(regexAny(['province', 'district', 'subdistrict'], options.location));
    }
    if (options.techStack?.length) {
      // ALL semantics: each requested term must match at least one array entry.
      clauses.push(
        ...options.techStack.map((term) => ({
          'analysis.techStack': { $elemMatch: { $regex: escapeRegex(term), $options: 'i' } },
        })),
      );
    }
    if (options.targetPlatforms?.length) {
      filter['analysis.targetPlatforms'] = { $in: options.targetPlatforms };
    }

    addDateRange(clauses, '$announce_date', options.publishedFrom, options.publishedTo);
    addDateRange(clauses, '$deadline_at', options.deadlineFrom, options.deadlineTo, true);
    if (clauses.length > 0) filter.$and = clauses;

    const collection = await this.records();
    if (options.order === 'urgency') {
      const [items, total] = await Promise.all([
        collection
          .aggregate<ProcurementDocument>([
            { $match: filter },
            ...URGENCY_ORDER,
            { $skip: options.offset },
            { $limit: options.limit },
            { $unset: URGENCY_FIELDS },
          ])
          .toArray(),
        collection.countDocuments(filter),
      ]);
      return { items: items.map(toDomain), total };
    }
    // Newest announcement first: a queue an administrator works top-down, and the
    // order a Run works through it in, so one stopped early has done the most
    // recent part. A deterministic order and nothing more — no stage or title
    // is trusted to say what is worth reading first.
    //
    // `_id` breaks any remaining tie. Without it, two documents with the same
    // announce date have no defined order between them, and `skip`ing through
    // pages could show one twice or skip it entirely depending on how the
    // storage engine happens to return ties on a given call.
    const [items, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ announce_date: -1, _id: 1 })
        .skip(options.offset)
        .limit(options.limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return { items: items.map(toDomain), total };
  }

  async listFailures(): Promise<IngestionFailure[]> {
    const documents = await (
      await this.failuresCollection()
    )
      .find({}, { projection: { _id: 0 } })
      .sort({ at: -1 })
      .toArray();
    return documents.map(({ _id: _ignored, kind, ...failure }) => ({
      ...failure,
      kind: kind ?? 'fault',
    }));
  }

  async recordFailures(failures: IngestionFailure[]): Promise<void> {
    if (failures.length === 0) return;
    await (await this.failuresCollection()).insertMany(failures.map((failure) => ({ ...failure })));
  }

  async markRun(at: string): Promise<void> {
    await (await this.meta()).updateOne({ _id: 'last_run' }, { $set: { at } }, { upsert: true });
  }

  async openDataQuota(): Promise<OpenDataQuota | null> {
    const document = await (await this.quotaDocuments()).findOne({ _id: QUOTA_ID });
    return document
      ? {
          remainingDay: document.remaining_day,
          limitDay: document.limit_day,
          observedAt: document.observed_at,
        }
      : null;
  }

  async recordOpenDataQuota(quota: OpenDataQuota): Promise<void> {
    await (
      await this.quotaDocuments()
    ).updateOne(
      { _id: QUOTA_ID },
      {
        $set: {
          remaining_day: quota.remainingDay,
          limit_day: quota.limitDay,
          observed_at: quota.observedAt,
        },
      },
      { upsert: true },
    );
  }

  async lastDiscoveryAt(): Promise<string | null> {
    return (await (await this.meta()).findOne({ _id: 'last_run' }))?.at ?? null;
  }

  async agencies(): Promise<string[]> {
    const names = await (await this.records()).distinct('dept_name');
    return names.sort();
  }

  async summary(): Promise<IngestionSummary> {
    const collection = await this.records();

    const [
      total,
      byStateRows,
      byOutcomeRows,
      byAgencyRows,
      byYearRows,
      torRows,
      failureCount,
      lastRun,
    ] = await Promise.all([
      collection.countDocuments({}),
      collection
        .aggregate<{ _id: IngestionState; count: number }>([
          { $group: { _id: '$state', count: { $sum: 1 } } },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: IngestionOutcome; count: number }>([
          { $group: { _id: '$outcome', count: { $sum: 1 } } },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$dept_name', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      collection
        .aggregate<{ _id: number; count: number }>([
          { $group: { _id: '$budget_year', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      // Only documents that turned out to be TORs count. A CONTRACTOR.pdf that
      // matched the filename pattern is in `documents`, but it is not a TOR and
      // must not inflate what an administrator reads as TORs retrieved.
      collection
        .aggregate<{ _id: null; count: number; bytes: number }>([
          { $unwind: '$documents' },
          { $match: { 'documents.role': { $in: ['main_tor', 'tor_variant'] } } },
          { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$documents.bytes' } } },
        ])
        .toArray(),
      (await this.failuresCollection()).countDocuments({}),
      (await this.meta()).findOne({ _id: 'last_run' }),
    ]);

    const byState = {} as Record<IngestionState, number>;
    for (const row of byStateRows) byState[row._id] = row.count;
    const byOutcome = {} as Record<IngestionOutcome, number>;
    // Old and new spellings of one outcome are added together, not overwritten.
    for (const row of byOutcomeRows) {
      const outcome = outcomeFromStored(row._id);
      byOutcome[outcome] = (byOutcome[outcome] ?? 0) + row.count;
    }

    return {
      total,
      byState,
      byOutcome,
      byAgency: byAgencyRows.map((row) => ({ deptName: row._id, count: row.count })),
      byYear: byYearRows.map((row) => ({ budgetYear: row._id, count: row.count })),
      torDocumentsRetrieved: torRows[0]?.count ?? 0,
      totalTorBytes: torRows[0]?.bytes ?? 0,
      failureCount,
      lastRunAt: lastRun?.at ?? null,
      openDataQuota: await this.openDataQuota(),
      // Owned by the service layer, which is what actually starts a run.
      runInProgress: false,
      runStartedAt: null,
      stopRequested: false,
    };
  }

  async stats(now: string, days: number): Promise<IngestionStats> {
    const { since, dates } = bangkokWindow(now, days);
    const [finished, discovered] = await Promise.all([
      (await this.records())
        .find(
          { state: { $in: ['Completed', 'Failed'] }, updated_at: { $gte: since } },
          { projection: { status_history: 1 } },
        )
        .toArray(),
      (await this.records())
        .aggregate<DailyDiscovered>([
          { $match: { discovered_at: { $gte: since } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  date: { $dateFromString: { dateString: '$discovered_at' } },
                  format: '%Y-%m-%d',
                  timezone: 'Asia/Bangkok',
                },
              },
              discovered: { $sum: 1 },
            },
          },
          { $project: { _id: 0, date: '$_id', discovered: 1 } },
        ])
        .toArray(),
    ]);
    const ends = finished
      .map((document) => lastPassEnd(document.status_history))
      .filter((end): end is StatusChange => end !== null && end.at >= since);
    const discoveredOn = new Map(discovered.map((day) => [day.date, day.discovered]));

    return {
      throughputDaily: throughputOf(ends, dates),
      discoveredDaily: dates.map((date) => ({ date, discovered: discoveredOn.get(date) ?? 0 })),
    };
  }

  async recent(limit: number): Promise<Procurement[]> {
    const documents = await (
      await this.records()
    )
      .find({})
      .sort({ updated_at: -1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.map(toDomain);
  }
}

const URGENCY_FIELDS = ['urgency_rank', 'urgency_undated', 'urgency_deadline'];

/** Stored status values, legacy spellings included (see `LEGACY_STATUSES`), by urgency rank. */
const URGENCY_RANKS: [number, string[]][] = [
  [0, ['open', 'invitation']],
  [1, ['unknown']],
  [2, ['drafting', 'evaluating', 'cancelled', 'drafting_tor', 'requisition']],
  [3, ['awarded', 'contracted', 'award_announced']],
];

const URGENCY_ORDER = [
  {
    $addFields: {
      urgency_rank: {
        $switch: {
          branches: URGENCY_RANKS.map(([rank, statuses]) => ({
            case: { $in: ['$status', statuses] },
            then: rank,
          })),
          default: 2,
        },
      },
    },
  },
  {
    $addFields: {
      // Only an open tender is ordered by its deadline; an unreadable one is undated.
      urgency_deadline: {
        $cond: [
          { $eq: ['$urgency_rank', 0] },
          { $dateFromString: { dateString: '$deadline_at', onError: null, onNull: null } },
          null,
        ],
      },
    },
  },
  { $addFields: { urgency_undated: { $cond: [{ $eq: ['$urgency_deadline', null] }, 1, 0] } } },
  {
    $sort: {
      urgency_rank: 1,
      urgency_undated: 1,
      urgency_deadline: 1,
      announce_date: -1,
      _id: 1,
    },
  },
];

function escapeRegex(value: string): string {
  return value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function regexAny(fields: readonly string[], value: string): Record<string, unknown> {
  const pattern = { $regex: escapeRegex(value), $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

/**
 * Stored dates are upstream/model strings, not BSON Dates. `$dateFromString`
 * avoids unsafe lexical comparisons and makes an unparseable or missing value
 * simply fail the range instead of aborting the whole query.
 */
function addDateRange(
  clauses: Record<string, unknown>[],
  field: string,
  from?: string,
  to?: string,
  thailandCalendar = false,
): void {
  if (!from && !to) return;

  const parsed = {
    $dateFromString: { dateString: field, onError: null, onNull: null },
  };
  if (thailandCalendar) {
    const day = {
      $dateToString: { date: parsed, format: '%Y-%m-%d', timezone: 'Asia/Bangkok', onNull: null },
    };
    const comparisons: Record<string, unknown>[] = [{ $ne: [day, null] }];
    if (from) comparisons.push({ $gte: [day, from] });
    if (to) comparisons.push({ $lte: [day, to] });
    clauses.push({ $expr: { $and: comparisons } });
    return;
  }
  // A missing or unreadable date is null, and null sorts below every date, so
  // without this guard an upper bound alone would match every undated record.
  const comparisons: Record<string, unknown>[] = [{ $ne: [parsed, null] }];
  if (from) comparisons.push({ $gte: [parsed, new Date(`${from}T00:00:00.000Z`)] });
  if (to) {
    const exclusiveEnd = new Date(`${to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    comparisons.push({ $lt: [parsed, exclusiveEnd] });
  }
  clauses.push({ $expr: { $and: comparisons } });
}
