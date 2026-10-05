import type {
  IngestionFailure,
  IngestionOutcome,
  IngestionState,
  Procurement,
} from '@torfun/types';
import type {
  FindOptions,
  FindResult,
  ProcurementStore,
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
export class InMemoryProcurementStore implements ProcurementStore {
  private readonly records = new Map<string, Procurement>();
  private readonly failures: IngestionFailure[] = [];
  private lastRunAt: string | null = null;

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
    state: IngestionState,
    outcome: IngestionOutcome,
    patch: Partial<Procurement> = {},
    detail?: string,
  ): Promise<Procurement | undefined> {
    const existing = this.records.get(projectId);
    if (!existing) return undefined;

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
        (options.eBidding === undefined || record.eBidding === options.eBidding),
    );
    return {
      items: items.slice(options.offset, options.offset + options.limit),
      total: items.length,
    };
  }

  async recordFailures(failures: IngestionFailure[]): Promise<void> {
    this.failures.push(...failures);
  }

  async markRun(at: string): Promise<void> {
    this.lastRunAt = at;
  }

  listFailures(): IngestionFailure[] {
    return this.failures;
  }
}
