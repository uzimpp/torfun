import type { Collection, Db } from 'mongodb';
import type {
  ArchiveDocument,
  IngestionFailure,
  IngestionOutcome,
  IngestionState,
  IngestionSummary,
  Procurement,
  ProcurementStatus,
  SoftwareClass,
  StatusChange,
  StatusSource,
  TargetPlatform,
  TorAnalysis,
  Winner,
} from '@torfun/types';
import { OUTCOME_STATE } from '@torfun/types';
import { mergeDiscovered } from './merge-discovered';
import { INGESTION_META_COLLECTION } from './ingestion-meta';

/**
 * Data access for ingested procurement records.
 *
 * This layer owns the only mapping between the stored documents and the
 * `Procurement` defined in `@torfun/types`. Nothing above it sees a snake_case
 * field or the derived `biddability_rank` that makes the queue's ordering
 * indexable.
 *
 * The store is filled only by an ingestion run — nothing is seeded — so what an
 * administrator sees is only ever what the pipeline actually retrieved.
 */

/**
 * How worth retrieving a stage makes a project, lowest first.
 *
 * `unknown` deliberately outranks the dead stages: it means upstream said
 * something this system does not recognise, which might still be an open
 * tender. Guessing it dead would hide real work.
 */
const BIDDABILITY_ORDER: ProcurementStatus[] = [
  'open',
  'drafting',
  'evaluating',
  'unknown',
  'awarded',
  'contracted',
  'cancelled',
];

function biddabilityRank(status: ProcurementStatus): number {
  const rank = BIDDABILITY_ORDER.indexOf(status);
  return rank === -1 ? BIDDABILITY_ORDER.indexOf('unknown') : rank;
}

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
  registry_name: string;
  dept_code: string;
  year: number;
  announce_date: string | null;
  project_type_name: string | null;
  purchase_method_name: string | null;
  project_money: number | null;
  price_build: number | null;
  status: ProcurementStatus;
  /** Absent on records written before the reading was attributed. */
  status_source?: StatusSource | null;
  upstream_status?: string | null;
  /** Derived from `status` on every write, purely so the queue's sort is indexable. */
  biddability_rank: number;
  matched_keywords: string[];
  software_class: SoftwareClass;
  software_score: number;
  e_bidding: boolean;
  state: IngestionState;
  outcome: IngestionOutcome;
  /** Absent on records written before retries were counted. */
  attempts?: number;
  status_history: StatusChange[];
  zip_id: string | null;
  zip_bytes: number | null;
  archive_member_count: number | null;
  /** Absent on records written before member names were kept. */
  archive_members?: string[];
  documents: ArchiveDocument[];
  analysis: TorAnalysis | null;
  winner: Winner | null;
  tor_ambiguous: boolean;
  discovered_at: string;
  updated_at: string;
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
    registryName: document.registry_name,
    deptCode: document.dept_code,
    year: document.year,
    announceDate: document.announce_date,
    projectTypeName: document.project_type_name,
    purchaseMethodName: document.purchase_method_name,
    projectMoney: document.project_money,
    priceBuild: document.price_build,
    status: statusFromStored(document.status),
    statusSource: document.status_source ?? null,
    upstreamStatus: document.upstream_status ?? null,
    matchedKeywords: document.matched_keywords,
    softwareClass: document.software_class,
    softwareScore: document.software_score,
    eBidding: document.e_bidding,
    state: document.state,
    outcome: outcomeFromStored(document.outcome),
    attempts: document.attempts ?? 0,
    statusHistory: document.status_history.map((entry) => ({
      ...entry,
      outcome: outcomeFromStored(entry.outcome),
    })),
    zipId: document.zip_id,
    zipBytes: document.zip_bytes,
    archiveMemberCount: document.archive_member_count,
    archiveMembers: document.archive_members ?? [],
    documents: document.documents,
    analysis: document.analysis,
    winner: document.winner,
    torAmbiguous: document.tor_ambiguous,
    discoveredAt: document.discovered_at,
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
    registry_name: record.registryName,
    dept_code: record.deptCode,
    year: record.year,
    announce_date: record.announceDate,
    project_type_name: record.projectTypeName,
    purchase_method_name: record.purchaseMethodName,
    project_money: record.projectMoney,
    price_build: record.priceBuild,
    status: record.status,
    status_source: record.statusSource,
    upstream_status: record.upstreamStatus,
    biddability_rank: biddabilityRank(record.status),
    matched_keywords: record.matchedKeywords,
    software_class: record.softwareClass,
    software_score: record.softwareScore,
    e_bidding: record.eBidding,
    state: record.state,
    outcome: record.outcome,
    attempts: record.attempts,
    status_history: record.statusHistory,
    zip_id: record.zipId,
    zip_bytes: record.zipBytes,
    archive_member_count: record.archiveMemberCount,
    archive_members: record.archiveMembers,
    documents: record.documents,
    analysis: record.analysis,
    winner: record.winner,
    tor_ambiguous: record.torAmbiguous,
    discovered_at: record.discoveredAt,
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
  year?: number;
  softwareClass?: SoftwareClass;
  /** Filter to one stage of the agency's own lifecycle. */
  status?: ProcurementStatus;
  eBidding?: boolean;
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
  limit: number;
  offset: number;
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
}

/**
 * The distinct agency names already ingested, read by the Client suggestion
 * endpoint so a vendor's spelling of a government body matches what the
 * tenders say. Upstream open data, so nothing here exposes another vendor.
 */
export interface AgencyNameSource {
  agencies(): Promise<string[]>;
}

/** All Procurement reads used above the persistence layer. */
export interface ProcurementDataSource extends ProcurementStore, AgencyNameSource {
  ensureIndexes(): Promise<void>;
  summary(): Promise<IngestionSummary>;
  /** The most recently updated procurements, newest first. */
  recent(limit: number): Promise<Procurement[]>;
  listFailures(): Promise<IngestionFailure[]>;
}

interface FailureDocument extends IngestionFailure {
  _id?: unknown;
}

export class ProcurementRepository implements ProcurementStore, AgencyNameSource {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ProcurementDocument>> {
    return (await this.getDb()).collection<ProcurementDocument>('procurements');
  }

  private async failuresCollection(): Promise<Collection<FailureDocument>> {
    return (await this.getDb()).collection<FailureDocument>('ingestion_failures');
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
        key: { state: 1, biddability_rank: 1, software_score: -1, project_money: -1, _id: 1 },
      },
      { key: { dept_name: 1 } },
      { key: { year: 1 } },
    ]);
  }

  /**
   * Insert or merge a discovered record.
   *
   * Deduplication is by projectId, per the functional requirements. What
   * survives a rediscovery is `mergeDiscovered`'s decision, not this method's:
   * upstream fields refresh, the pipeline's own findings are preserved. Writing
   * through `toDocument` is what re-derives `biddability_rank` from a refreshed
   * status, so the retrieval queue re-sorts itself.
   */
  async upsert(record: Procurement): Promise<Procurement> {
    const collection = await this.records();
    const existing = await collection.findOne({ _id: record.projectId });

    if (!existing) {
      const document = toDocument(record);
      await collection.insertOne(document);
      return toDomain(document);
    }

    const merged = toDocument(mergeDiscovered(toDomain(existing), record));
    await collection.replaceOne({ _id: record.projectId }, merged);
    return toDomain(merged);
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
      status_history: [...existing.status_history, entry],
      updated_at: at,
    };
    await collection.replaceOne({ _id: projectId }, updated);
    return toDomain(updated);
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
    if (options.year) filter.year = options.year;
    if (options.softwareClass) filter.software_class = options.softwareClass;
    if (options.status) filter.status = options.status;
    if (options.excludeAwarded) filter.winner = null;
    if (options.eBidding !== undefined) filter.e_bidding = options.eBidding;
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
    addDateRange(clauses, '$analysis.deadlineAt', options.deadlineFrom, options.deadlineTo, true);
    if (clauses.length > 0) filter.$and = clauses;

    const collection = await this.records();
    // Most relevant first: a queue an admin works top-down, and the order a
    // capped run spends its downloads in. Biddability leads — a settled contract
    // cannot be bid on however promising it looks — then software-likeness, then
    // contract value. A priority, never a filter: nothing is excluded, because
    // the stage comes from upstream free text and `unknown` may well be live.
    //
    // `_id` breaks any remaining tie. Without it, two documents equal on all
    // three priority fields have no defined order between them, and `skip`ing
    // through pages could show one twice or skip it entirely depending on how
    // the storage engine happens to return ties on a given call.
    const [items, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ biddability_rank: 1, software_score: -1, project_money: -1, _id: 1 })
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
    return documents as IngestionFailure[];
  }

  async recordFailures(failures: IngestionFailure[]): Promise<void> {
    if (failures.length === 0) return;
    await (await this.failuresCollection()).insertMany(failures.map((failure) => ({ ...failure })));
  }

  async markRun(at: string): Promise<void> {
    await (await this.meta()).updateOne({ _id: 'last_run' }, { $set: { at } }, { upsert: true });
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
          { $group: { _id: '$year', count: { $sum: 1 } } },
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
      byYear: byYearRows.map((row) => ({ year: row._id, count: row.count })),
      torDocumentsRetrieved: torRows[0]?.count ?? 0,
      totalTorBytes: torRows[0]?.bytes ?? 0,
      failureCount,
      lastRunAt: lastRun?.at ?? null,
      // Owned by the service layer, which is what actually starts a run.
      runInProgress: false,
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
