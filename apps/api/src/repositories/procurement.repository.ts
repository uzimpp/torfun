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
  TorAnalysis,
  Winner,
} from '@torfun/types';
import { mergeDiscovered } from './merge-discovered';

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
  'invitation',
  'drafting_tor',
  'requisition',
  'unknown',
  'award_announced',
  'contracted',
  'cancelled',
];

function biddabilityRank(status: ProcurementStatus): number {
  const rank = BIDDABILITY_ORDER.indexOf(status);
  return rank === -1 ? BIDDABILITY_ORDER.indexOf('unknown') : rank;
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
  registry_name: string;
  dept_code: string;
  year: number;
  announce_date: string | null;
  project_type_name: string | null;
  purchase_method_name: string | null;
  project_money: number | null;
  price_build: number | null;
  status: ProcurementStatus;
  /** Derived from `status` on every write, purely so the queue's sort is indexable. */
  biddability_rank: number;
  matched_keywords: string[];
  software_class: SoftwareClass;
  software_score: number;
  e_bidding: boolean;
  state: IngestionState;
  outcome: IngestionOutcome;
  status_history: StatusChange[];
  zip_id: string | null;
  zip_bytes: number | null;
  archive_member_count: number | null;
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
    registryName: document.registry_name,
    deptCode: document.dept_code,
    year: document.year,
    announceDate: document.announce_date,
    projectTypeName: document.project_type_name,
    purchaseMethodName: document.purchase_method_name,
    projectMoney: document.project_money,
    priceBuild: document.price_build,
    status: document.status,
    matchedKeywords: document.matched_keywords,
    softwareClass: document.software_class,
    softwareScore: document.software_score,
    eBidding: document.e_bidding,
    state: document.state,
    outcome: document.outcome,
    statusHistory: document.status_history,
    zipId: document.zip_id,
    zipBytes: document.zip_bytes,
    archiveMemberCount: document.archive_member_count,
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
    registry_name: record.registryName,
    dept_code: record.deptCode,
    year: record.year,
    announce_date: record.announceDate,
    project_type_name: record.projectTypeName,
    purchase_method_name: record.purchaseMethodName,
    project_money: record.projectMoney,
    price_build: record.priceBuild,
    status: record.status,
    biddability_rank: biddabilityRank(record.status),
    matched_keywords: record.matchedKeywords,
    software_class: record.softwareClass,
    software_score: record.softwareScore,
    e_bidding: record.eBidding,
    state: record.state,
    outcome: record.outcome,
    status_history: record.statusHistory,
    zip_id: record.zipId,
    zip_bytes: record.zipBytes,
    archive_member_count: record.archiveMemberCount,
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
  deptName?: string;
  year?: number;
  softwareClass?: SoftwareClass;
  /** Filter to one stage of the agency's own lifecycle. */
  status?: ProcurementStatus;
  eBidding?: boolean;
  /** Case-insensitive substring over project name and id. */
  query?: string;
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
  transition(
    projectId: string,
    state: IngestionState,
    outcome: IngestionOutcome,
    patch?: Partial<Procurement>,
    detail?: string,
  ): Promise<Procurement | undefined>;
  find(options: FindOptions): Promise<FindResult>;
  recordFailures(failures: IngestionFailure[]): Promise<void>;
  markRun(at: string): Promise<void>;
}

interface FailureDocument extends IngestionFailure {
  _id?: unknown;
}

export class ProcurementRepository implements ProcurementStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ProcurementDocument>> {
    return (await this.getDb()).collection<ProcurementDocument>('procurements');
  }

  private async failuresCollection(): Promise<Collection<FailureDocument>> {
    return (await this.getDb()).collection<FailureDocument>('ingestion_failures');
  }

  private async meta(): Promise<Collection<{ _id: string; at: string }>> {
    return (await this.getDb()).collection<{ _id: string; at: string }>('ingestion_meta');
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
      { key: { state: 1, biddability_rank: 1, software_score: -1, project_money: -1 } },
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
    state: IngestionState,
    outcome: IngestionOutcome,
    patch: Partial<Procurement> = {},
    detail?: string,
  ): Promise<Procurement | undefined> {
    const collection = await this.records();
    const existing = await collection.findOne({ _id: projectId });
    if (!existing) return undefined;

    const at = new Date().toISOString();
    const updated: ProcurementDocument = {
      ...toDocument({ ...toDomain(existing), ...patch }),
      state,
      outcome,
      status_history: [...existing.status_history, { state, outcome, at, detail }],
      updated_at: at,
    };
    await collection.replaceOne({ _id: projectId }, updated);
    return toDomain(updated);
  }

  async get(projectId: string): Promise<Procurement | undefined> {
    const document = await (await this.records()).findOne({ _id: projectId });
    return document ? toDomain(document) : undefined;
  }

  async find(options: FindOptions): Promise<FindResult> {
    const filter: Record<string, unknown> = {};
    if (options.state) filter.state = options.state;
    if (options.outcome) filter.outcome = options.outcome;
    if (options.deptName) filter.dept_name = options.deptName;
    if (options.year) filter.year = options.year;
    if (options.softwareClass) filter.software_class = options.softwareClass;
    if (options.status) filter.status = options.status;
    if (options.eBidding !== undefined) filter.e_bidding = options.eBidding;
    if (options.query?.trim()) {
      const escaped = options.query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { project_name: { $regex: escaped, $options: 'i' } },
        { _id: { $regex: escaped, $options: 'i' } },
      ];
    }

    const collection = await this.records();
    // Most relevant first: a queue an admin works top-down, and the order a
    // capped run spends its downloads in. Biddability leads — a settled contract
    // cannot be bid on however promising it looks — then software-likeness, then
    // contract value. A priority, never a filter: nothing is excluded, because
    // the stage comes from upstream free text and `unknown` may well be live.
    const [items, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ biddability_rank: 1, software_score: -1, project_money: -1 })
        .skip(options.offset)
        .limit(options.limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    return { items: items.map(toDomain), total };
  }

  async listFailures(): Promise<IngestionFailure[]> {
    const documents = await (await this.failuresCollection())
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
    await (
      await this.meta()
    ).updateOne({ _id: 'last_run' }, { $set: { at } }, { upsert: true });
  }

  async agencies(): Promise<string[]> {
    const names = await (await this.records()).distinct('dept_name');
    return names.sort();
  }

  async summary(): Promise<IngestionSummary> {
    const collection = await this.records();

    const [total, byStateRows, byOutcomeRows, byAgencyRows, byYearRows, torRows, failureCount, lastRun] =
      await Promise.all([
        collection.countDocuments({}),
        collection.aggregate<{ _id: IngestionState; count: number }>([
          { $group: { _id: '$state', count: { $sum: 1 } } },
        ]).toArray(),
        collection.aggregate<{ _id: IngestionOutcome; count: number }>([
          { $group: { _id: '$outcome', count: { $sum: 1 } } },
        ]).toArray(),
        collection.aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$dept_name', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]).toArray(),
        collection.aggregate<{ _id: number; count: number }>([
          { $group: { _id: '$year', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]).toArray(),
        // Only documents that turned out to be TORs count. A CONTRACTOR.pdf that
        // matched the filename pattern is in `documents`, but it is not a TOR and
        // must not inflate what an administrator reads as TORs retrieved.
        collection.aggregate<{ _id: null; count: number; bytes: number }>([
          { $unwind: '$documents' },
          { $match: { 'documents.role': { $in: ['main_tor', 'tor_variant'] } } },
          { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$documents.bytes' } } },
        ]).toArray(),
        (await this.failuresCollection()).countDocuments({}),
        (await this.meta()).findOne({ _id: 'last_run' }),
      ]);

    const byState = {} as Record<IngestionState, number>;
    for (const row of byStateRows) byState[row._id] = row.count;
    const byOutcome = {} as Record<IngestionOutcome, number>;
    for (const row of byOutcomeRows) byOutcome[row._id] = row.count;

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
}
