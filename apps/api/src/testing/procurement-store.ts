import {
  appendStatusChange,
  OUTCOME_STATE,
  type IngestionFailure,
  type IngestionOutcome,
  type IngestionSummary,
  type OpenDataQuota,
  type Procurement,
  type Tombstone,
} from '@torfun/types';
import {
  holdReasonFor,
  type FeedCursor,
  type FindOptions,
  type FindResult,
  type ProcurementDataSource,
  type UpsertSummary,
} from '../repositories/procurement.repository';
import { mergeDiscovered } from '../repositories/merge-discovered';
import { hashSource, hasUpstreamChange } from '../repositories/source-hash';

/**
 * An in-memory `ProcurementStore` for driving an ingestion run in a test.
 *
 * Deliberately not a mock: it really stores records and really merges them, so
 * a pipeline test asserts on what the run produced rather than on which methods
 * it happened to call. Ordering is left to the real repository's integration
 * tests, which is where a Mongo sort can actually be verified.
 */
export class InMemoryProcurementStore implements ProcurementDataSource {
  private readonly records = new Map<string, Procurement>();
  private readonly failures: IngestionFailure[] = [];
  private readonly tombstones = new Map<string, Tombstone>();
  private lastRunAt: string | null = null;
  private quota: OpenDataQuota | null = null;
  private cursor: FeedCursor = {};

  async ensureIndexes(): Promise<void> {
    // The in-memory store has no indexes; this preserves the production
    // lifecycle contract without making tests depend on MongoDB.
  }

  async get(projectId: string): Promise<Procurement | undefined> {
    return this.records.get(projectId);
  }

  async upsert(record: Procurement): Promise<Procurement> {
    const existing = this.records.get(record.projectId);
    if (!existing) {
      this.records.set(record.projectId, record);
      return record;
    }
    // The same merge rule the real repository uses, so a pipeline test cannot
    // pass against a fake that keeps different fields.
    const merged = mergeDiscovered(existing, record);
    this.records.set(merged.projectId, merged);
    return merged;
  }

  async tombstone(tombstone: Tombstone): Promise<void> {
    this.tombstones.set(tombstone.projectId, tombstone);
    this.records.delete(tombstone.projectId);
  }

  async remove(projectId: string): Promise<boolean> {
    return this.records.delete(projectId);
  }

  async tombstonedIds(projectIds: string[]): Promise<Set<string>> {
    return new Set(projectIds.filter((id) => this.tombstones.has(id)));
  }

  async listTombstones(): Promise<Tombstone[]> {
    return [...this.tombstones.values()];
  }

  async removeTombstone(projectId: string): Promise<boolean> {
    return this.tombstones.delete(projectId);
  }

  async upsertMany(records: Procurement[]): Promise<UpsertSummary> {
    // The same counting rule as the real repository's bulk write.
    const summary: UpsertSummary = { created: 0, changed: 0, unchanged: 0 };
    for (const record of records) {
      const existing = this.records.get(record.projectId);
      if (!existing) summary.created += 1;
      else if (hasUpstreamChange(existing, record)) summary.changed += 1;
      else summary.unchanged += 1;
      await this.upsert(
        existing ? record : { ...record, sourceHash: record.sourceHash ?? hashSource(record) },
      );
    }
    return summary;
  }

  async transition(
    projectId: string,
    outcome: IngestionOutcome,
    patch: Partial<Procurement> = {},
    detail?: string,
  ): Promise<Procurement | undefined> {
    const existing = this.records.get(projectId);
    if (!existing) return undefined;

    const state = OUTCOME_STATE[outcome];
    const at = new Date().toISOString();
    const updated: Procurement = {
      ...existing,
      ...patch,
      state,
      outcome,
      holdReason: holdReasonFor(outcome, patch),
      statusHistory: appendStatusChange(existing.statusHistory, { state, outcome, at, detail }),
      updatedAt: at,
    };
    this.records.set(projectId, updated);
    return updated;
  }

  async find(options: FindOptions): Promise<FindResult> {
    const items = [...this.records.values()].filter(
      (record) =>
        (!options.state || record.state === options.state) &&
        (!options.outcome || record.outcome === options.outcome) &&
        (!options.status || record.status === options.status) &&
        (options.attemptsBelow === undefined || record.attempts < options.attemptsBelow),
    );
    return {
      items: items.slice(options.offset, options.offset + options.limit),
      total: items.length,
    };
  }

  async amend(
    projectId: string,
    patch: Partial<Procurement>,
    touch: boolean,
  ): Promise<Procurement | undefined> {
    const existing = this.records.get(projectId);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...patch,
      updatedAt: touch ? new Date().toISOString() : existing.updatedAt,
    };
    this.records.set(projectId, updated);
    return updated;
  }

  async dueForTimeline(page: { limit: number; offset: number }): Promise<Procurement[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          (record.state === 'Completed' || record.state === 'Failed') &&
          record.status !== 'contracted',
      )
      .sort(
        (a, b) =>
          (a.timelineCheckedAt ?? '').localeCompare(b.timelineCheckedAt ?? '') ||
          a.projectId.localeCompare(b.projectId),
      )
      .slice(page.offset, page.offset + page.limit);
  }

  async requeueStale(cutoff: string): Promise<number> {
    const stale = [...this.records.values()].filter(
      (record) =>
        record.state === 'Processing' &&
        (record.statusHistory.at(-1)?.at ?? record.updatedAt) < cutoff,
    );
    for (const record of stale) {
      const since = record.statusHistory.at(-1)?.at ?? record.updatedAt;
      await this.transition(
        record.projectId,
        'queued',
        {},
        `Requeued: stuck in Processing since ${since} with no progress.`,
      );
    }
    return stale.length;
  }

  async recordFailures(failures: IngestionFailure[]): Promise<void> {
    this.failures.push(...failures);
  }

  async markRun(at: string): Promise<void> {
    this.lastRunAt = at;
  }

  async openDataQuota(): Promise<OpenDataQuota | null> {
    return this.quota;
  }

  async recordOpenDataQuota(quota: OpenDataQuota): Promise<void> {
    this.quota = quota;
  }

  async lastDiscoveryAt(): Promise<string | null> {
    return this.lastRunAt;
  }

  async feedCursor(): Promise<FeedCursor> {
    return structuredClone(this.cursor);
  }

  async recordFeedCursor(cursor: FeedCursor): Promise<void> {
    Object.assign(this.cursor, structuredClone(cursor));
  }

  async listFailures(): Promise<IngestionFailure[]> {
    return this.failures;
  }

  async agencies(): Promise<string[]> {
    return [...new Set([...this.records.values()].map((record) => record.deptName))].sort();
  }

  async summary(): Promise<IngestionSummary> {
    const records = [...this.records.values()];
    const byState = {} as IngestionSummary['byState'];
    const byOutcome = {} as IngestionSummary['byOutcome'];
    for (const record of records) {
      byState[record.state] = (byState[record.state] ?? 0) + 1;
      byOutcome[record.outcome] = (byOutcome[record.outcome] ?? 0) + 1;
    }
    return {
      total: records.length,
      byState,
      byOutcome,
      byAgency: [],
      byYear: [],
      torDocumentsRetrieved: 0,
      totalTorBytes: 0,
      failureCount: this.failures.length,
      lastRunAt: this.lastRunAt,
      openDataQuota: this.quota,
      runInProgress: false,
      runStartedAt: null,
      stopRequested: false,
    };
  }

  async recent(limit: number): Promise<Procurement[]> {
    return [...this.records.values()]
      .sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.projectId.localeCompare(b.projectId),
      )
      .slice(0, limit);
  }
}
