import type { Collection, Db } from 'mongodb';
import type { IngestionRun, RunCounts } from '@torfun/types';

/** The run log: one entry per finished Run, kept 90 days. */
export interface IngestionRunStore {
  record(run: IngestionRun): Promise<void>;
  /** Newest first. */
  recent(limit: number): Promise<IngestionRun[]>;
  ensureIndexes(): Promise<void>;
}

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

interface CountsDocument {
  discovered: number;
  new_records: number;
  changed_records: number;
  unchanged_records: number;
  discovery_skipped: boolean;
  discovery_stopped: RunCounts['discoveryStopped'];
  rejected_non_registry: number;
  attempted: number;
  refreshed: number;
  archives_retrieved: number;
  tor_analysed: number;
  held: number;
  dropped: number;
  failed: number;
  aborted: boolean;
  stopped: RunCounts['stopped'];
}

interface RunDocument {
  _id: string;
  started_at: string;
  /** A BSON Date, unlike every other date here, because a TTL index only reads Dates. */
  ended_at: Date;
  duration_ms: number;
  trigger: IngestionRun['trigger'];
  runners: number;
  counts: CountsDocument | null;
  error: string | null;
  tokens: IngestionRun['tokens'];
  peak_rss_bytes: number;
}

function countsToDocument(counts: RunCounts): CountsDocument {
  return {
    discovered: counts.discovered,
    new_records: counts.newRecords,
    changed_records: counts.changedRecords,
    unchanged_records: counts.unchangedRecords,
    discovery_skipped: counts.discoverySkipped,
    discovery_stopped: counts.discoveryStopped,
    rejected_non_registry: counts.rejectedNonRegistry,
    attempted: counts.attempted,
    refreshed: counts.refreshed,
    archives_retrieved: counts.archivesRetrieved,
    tor_analysed: counts.torAnalysed,
    held: counts.held,
    dropped: counts.dropped,
    failed: counts.failed,
    aborted: counts.aborted,
    stopped: counts.stopped,
  };
}

function countsFromDocument(document: CountsDocument): RunCounts {
  return {
    discovered: document.discovered,
    newRecords: document.new_records,
    changedRecords: document.changed_records,
    unchangedRecords: document.unchanged_records,
    discoverySkipped: document.discovery_skipped,
    discoveryStopped: document.discovery_stopped,
    rejectedNonRegistry: document.rejected_non_registry,
    attempted: document.attempted,
    refreshed: document.refreshed,
    archivesRetrieved: document.archives_retrieved,
    torAnalysed: document.tor_analysed,
    held: document.held,
    dropped: document.dropped,
    failed: document.failed,
    aborted: document.aborted,
    stopped: document.stopped,
  };
}

export class IngestionRunRepository implements IngestionRunStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async runs(): Promise<Collection<RunDocument>> {
    return (await this.getDb()).collection<RunDocument>('ingestion_runs');
  }

  async ensureIndexes(): Promise<void> {
    await (
      await this.runs()
    ).createIndex({ ended_at: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
  }

  async record(run: IngestionRun): Promise<void> {
    await (
      await this.runs()
    ).insertOne({
      _id: run.id,
      started_at: run.startedAt,
      ended_at: new Date(run.endedAt),
      duration_ms: run.durationMs,
      trigger: run.trigger,
      runners: run.runners,
      counts: run.counts ? countsToDocument(run.counts) : null,
      error: run.error,
      tokens: run.tokens,
      peak_rss_bytes: run.peakRssBytes,
    });
  }

  async recent(limit: number): Promise<IngestionRun[]> {
    const documents = await (
      await this.runs()
    )
      .find({})
      .sort({ ended_at: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => ({
      id: document._id,
      startedAt: document.started_at,
      endedAt: document.ended_at.toISOString(),
      durationMs: document.duration_ms,
      trigger: document.trigger,
      runners: document.runners,
      counts: document.counts ? countsFromDocument(document.counts) : null,
      error: document.error,
      tokens: {
        prompt: document.tokens.prompt,
        output: document.tokens.output,
        thoughts: document.tokens.thoughts,
        total: document.tokens.total,
        calls: document.tokens.calls,
      },
      peakRssBytes: document.peak_rss_bytes,
    }));
  }
}
