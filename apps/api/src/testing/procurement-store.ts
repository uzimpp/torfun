import {
  OUTCOME_STATE,
  type IngestionFailure,
  type IngestionOutcome,
  type IngestionSummary,
  type Procurement,
} from '@torfun/types';
import type {
  FindOptions,
  FindResult,
  ProcurementDataSource,
} from '../repositories/procurement.repository';
import { mergeDiscovered } from '../repositories/merge-discovered';

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
  private lastRunAt: string | null = null;

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
      statusHistory: [...existing.statusHistory, { state, outcome, at, detail }],
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
        (options.attemptsBelow === undefined || record.attempts < options.attemptsBelow) &&
        (options.eBidding === undefined || record.eBidding === options.eBidding),
    );
    return {
      items: items.slice(options.offset, options.offset + options.limit),
      total: items.length,
    };
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
      runInProgress: false,
    };
  }

  async recent(limit: number): Promise<Procurement[]> {
    return [...this.records.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.projectId.localeCompare(b.projectId))
      .slice(0, limit);
  }
}
