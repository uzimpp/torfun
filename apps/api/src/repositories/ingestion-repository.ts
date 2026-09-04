import type {
  IngestionFailure,
  IngestionOutcome,
  IngestionRecord,
  IngestionState,
  IngestionSummary,
  SoftwareClass,
} from '@torfun/types';

/**
 * In-memory store for ingested procurement records.
 *
 * Deliberately behind a narrow interface: the API surface is
 * find/get/upsert/summary and nothing else, so swapping this for a Mongo-backed
 * implementation is a one-file change. MONGODB_URI is already configured but no
 * driver is wired up yet.
 *
 * The store starts empty and is filled by an ingestion run — nothing is seeded,
 * so what an admin sees is only ever what the pipeline actually retrieved.
 */

export interface FindOptions {
  state?: IngestionState;
  outcome?: IngestionOutcome;
  deptName?: string;
  year?: number;
  softwareClass?: SoftwareClass;
  eBidding?: boolean;
  /** Case-insensitive substring over project name and id. */
  query?: string;
  limit: number;
  offset: number;
}

export interface FindResult {
  items: IngestionRecord[];
  total: number;
}

export class IngestionRepository {
  private records = new Map<string, IngestionRecord>();
  private failures: IngestionFailure[] = [];
  private lastRunAt: string | null = null;

  /**
   * Insert or merge a discovered record.
   *
   * Deduplication is by projectId, per the functional requirements. An existing
   * record keeps its processing state and history — rediscovering a project must
   * not reset a completed download back to Queued — and only gains any newly
   * matched keywords.
   */
  upsert(record: IngestionRecord): IngestionRecord {
    const existing = this.records.get(record.projectId);
    if (!existing) {
      this.records.set(record.projectId, record);
      return record;
    }

    const merged: IngestionRecord = {
      ...existing,
      matchedKeywords: [...new Set([...existing.matchedKeywords, ...record.matchedKeywords])],
      updatedAt: new Date().toISOString(),
    };
    this.records.set(merged.projectId, merged);
    return merged;
  }

  /** Advance a record's state, appending to its history. */
  transition(
    projectId: string,
    state: IngestionState,
    outcome: IngestionOutcome,
    patch: Partial<IngestionRecord> = {},
    detail?: string,
  ): IngestionRecord | undefined {
    const existing = this.records.get(projectId);
    if (!existing) return undefined;

    const at = new Date().toISOString();
    const updated: IngestionRecord = {
      ...existing,
      ...patch,
      state,
      outcome,
      statusHistory: [...existing.statusHistory, { state, outcome, at, detail }],
      updatedAt: at,
    };
    this.records.set(projectId, updated);
    return updated;
  }

  get(projectId: string): IngestionRecord | undefined {
    return this.records.get(projectId);
  }

  find(options: FindOptions): FindResult {
    const query = options.query?.trim().toLowerCase();

    const filtered = [...this.records.values()].filter((record) => {
      if (options.state && record.state !== options.state) return false;
      if (options.outcome && record.outcome !== options.outcome) return false;
      if (options.deptName && record.deptName !== options.deptName) return false;
      if (options.year && record.year !== options.year) return false;
      if (options.softwareClass && record.softwareClass !== options.softwareClass) return false;
      if (options.eBidding !== undefined && record.eBidding !== options.eBidding) return false;
      if (query) {
        const haystack = `${record.projectName} ${record.projectId}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    // Most relevant first: a queue an admin works top-down. Software-likeness
    // then contract value, both descending.
    filtered.sort(
      (a, b) => b.softwareScore - a.softwareScore || (b.projectMoney ?? 0) - (a.projectMoney ?? 0),
    );

    return {
      items: filtered.slice(options.offset, options.offset + options.limit),
      total: filtered.length,
    };
  }

  listFailures(): IngestionFailure[] {
    return [...this.failures].sort((a, b) => b.at.localeCompare(a.at));
  }

  recordFailures(failures: IngestionFailure[]): void {
    this.failures.push(...failures);
  }

  markRun(at: string): void {
    this.lastRunAt = at;
  }

  /** Distinct agency names present, for populating the admin filter. */
  agencies(): string[] {
    return [...new Set([...this.records.values()].map((r) => r.deptName))].sort();
  }

  summary(): IngestionSummary {
    const records = [...this.records.values()];

    const byState = {} as Record<IngestionState, number>;
    const byOutcome = {} as Record<IngestionOutcome, number>;
    const agencyCounts = new Map<string, number>();
    const yearCounts = new Map<number, number>();
    let torFilesRetrieved = 0;
    let totalTorBytes = 0;

    for (const record of records) {
      byState[record.state] = (byState[record.state] ?? 0) + 1;
      byOutcome[record.outcome] = (byOutcome[record.outcome] ?? 0) + 1;
      agencyCounts.set(record.deptName, (agencyCounts.get(record.deptName) ?? 0) + 1);
      yearCounts.set(record.year, (yearCounts.get(record.year) ?? 0) + 1);
      torFilesRetrieved += record.torFiles.length;
      totalTorBytes += record.torFiles.reduce((sum, file) => sum + file.bytes, 0);
    }

    return {
      total: records.length,
      byState,
      byOutcome,
      byAgency: [...agencyCounts.entries()]
        .map(([deptName, count]) => ({ deptName, count }))
        .sort((a, b) => b.count - a.count),
      byYear: [...yearCounts.entries()]
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year - b.year),
      torFilesRetrieved,
      totalTorBytes,
      failureCount: this.failures.length,
      lastRunAt: this.lastRunAt,
      // Owned by the route layer, which is what actually starts a run.
      runInProgress: false,
    };
  }
}

/** Process-wide singleton — the store is in-memory, so one instance per process. */
export const ingestionRepository = new IngestionRepository();
