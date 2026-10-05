import type { IngestionRun, IngestionStats } from '@torfun/types';
import type { IngestionRunStore } from '../repositories/ingestion-run.repository';
import type { IngestionStatsSource } from '../repositories/procurement.repository';

/** An in-memory run log; the real one's ordering and retention are proved against Mongo. */
export class InMemoryIngestionRunStore implements IngestionRunStore {
  readonly runs: IngestionRun[] = [];

  async record(run: IngestionRun): Promise<void> {
    this.runs.push(run);
  }

  async ensureIndexes(): Promise<void> {}

  async recent(limit: number): Promise<IngestionRun[]> {
    return [...this.runs].sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, limit);
  }
}

/** Stats with nothing in them, for tests that are not about them. */
export const noStats: IngestionStatsSource = {
  stats: async (): Promise<IngestionStats> => ({
    recordTimings: { sample: 0, p50Ms: null, p90Ms: null, downloadP50Ms: null, analyseP50Ms: null },
    throughputDaily: [],
    discoveredDaily: [],
    failuresByStage: [],
  }),
};
