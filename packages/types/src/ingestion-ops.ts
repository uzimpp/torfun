import { z } from 'zod';
import { IngestionFailureSchema } from './egp';

/**
 * What an administrator watches a Run and its history by. Everything here is
 * measured by the pipeline or read from stored records; nothing is estimated.
 */

export const IngestionStage = IngestionFailureSchema.shape.stage;
export type IngestionStage = z.infer<typeof IngestionStage>;

/** Model tokens, summed over successful calls. A call that threw reports none. */
export const TokenUsageSchema = z.object({
  prompt: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  thoughts: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  calls: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** One record a runner is working on right now. */
export const InFlightWorkSchema = z.object({
  /** Which runner (0-based) has it. */
  slot: z.number().int().nonnegative(),
  projectId: z.string(),
  projectName: z.string(),
  stage: IngestionStage,
  /** False where the record was already read and only its timeline is refreshed. */
  fresh: z.boolean(),
  /** When it entered `stage`. */
  since: z.string(),
});
export type InFlightWork = z.infer<typeof InFlightWorkSchema>;

/** Where a Run has got to, as its pipeline reports it. */
export const RunProgressSchema = z.object({
  inFlight: z.array(InFlightWorkSchema),
  /** Candidates not yet taken up; null until the queue has been built. */
  queueRemaining: z.number().int().nonnegative().nullable(),
});
export type RunProgress = z.infer<typeof RunProgressSchema>;

/** Memory of the process running the Run, as of its last heartbeat. */
export const RunMemorySchema = z.object({
  rssBytes: z.number().nonnegative(),
  heapUsedBytes: z.number().nonnegative(),
  /** Highest RSS sampled since the Run began. */
  peakRssBytes: z.number().nonnegative(),
  sampledAt: z.string(),
});
export type RunMemory = z.infer<typeof RunMemorySchema>;

/** What a live Run's heartbeat writes to the lease, so any instance can serve it. */
export const LeaseLiveSchema = RunProgressSchema.extend({ memory: RunMemorySchema });
export type LeaseLive = z.infer<typeof LeaseLiveSchema>;

export const RunTrigger = z.enum(['manual', 'scheduled']);
export type RunTrigger = z.infer<typeof RunTrigger>;

/** The pipeline's tally for one Run. */
export const RunCountsSchema = z.object({
  discovered: z.number().int(),
  newRecords: z.number().int(),
  changedRecords: z.number().int(),
  unchangedRecords: z.number().int(),
  discoverySkipped: z.boolean(),
  discoveryStopped: z.enum(['rate_limited', 'budget']).nullable(),
  rejectedNonRegistry: z.number().int(),
  attempted: z.number().int(),
  refreshed: z.number().int(),
  archivesRetrieved: z.number().int(),
  torAnalysed: z.number().int(),
  held: z.number().int(),
  dropped: z.number().int(),
  failed: z.number().int(),
  aborted: z.boolean(),
  stopped: z.enum(['admin']).nullable(),
});
export type RunCounts = z.infer<typeof RunCountsSchema>;

/** One finished Run, written once when it ends. */
export const IngestionRunSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number().int().nonnegative(),
  trigger: RunTrigger,
  runners: z.number().int().positive(),
  /** Null where the pass threw before it could count anything; `error` says why. */
  counts: RunCountsSchema.nullable(),
  error: z.string().nullable(),
  tokens: TokenUsageSchema,
  peakRssBytes: z.number().nonnegative(),
});
export type IngestionRun = z.infer<typeof IngestionRunSchema>;

/**
 * Time from a record's last `downloading` to the end of that pass, over records
 * that finished one in the window. Dropped records (deleted) and refresh-only
 * work (no `downloading`) are not in it. Null where there is no sample.
 */
export const RecordTimingsSchema = z.object({
  sample: z.number().int().nonnegative(),
  p50Ms: z.number().nonnegative().nullable(),
  p90Ms: z.number().nonnegative().nullable(),
  downloadP50Ms: z.number().nonnegative().nullable(),
  analyseP50Ms: z.number().nonnegative().nullable(),
});
export type RecordTimings = z.infer<typeof RecordTimingsSchema>;

/**
 * Retrieval passes that ended on a day (Asia/Bangkok), by the outcome each ended
 * on; only days with any. `completed` is `tor_analysed`, `held` is
 * `needs_review`, `failed` is `analysis_failed` or `abandoned`. A pass that ended
 * `no_tor_package` or `no_tor_in_archive` is in none of them: upstream published
 * no TOR, which is an answer, not a failure. Dropped records are deleted, so they
 * are not counted either.
 */
export const DailyThroughputSchema = z.object({
  date: z.string(),
  completed: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type DailyThroughput = z.infer<typeof DailyThroughputSchema>;

export const StageFailuresSchema = z.object({
  stage: IngestionStage,
  count: z.number().int().nonnegative(),
});
export type StageFailures = z.infer<typeof StageFailuresSchema>;

/** Stored history the operations view reads, over a trailing window. */
export const IngestionStatsSchema = z.object({
  recordTimings: RecordTimingsSchema,
  throughputDaily: z.array(DailyThroughputSchema),
  /** Logged failures of kind `fault`; a `no_tor` answer is not one. */
  failuresByStage: z.array(StageFailuresSchema),
});
export type IngestionStats = z.infer<typeof IngestionStatsSchema>;

export const LiveRunSchema = z.object({
  runInProgress: z.boolean(),
  runStartedAt: z.string().nullable(),
  elapsedMs: z.number().int().nonnegative().nullable(),
  stopRequested: z.boolean(),
  /** Null until the Run's first heartbeat, or when none is going. */
  inFlight: z.array(InFlightWorkSchema).nullable(),
  queueRemaining: z.number().int().nonnegative().nullable(),
  memory: RunMemorySchema.nullable(),
});
export type LiveRun = z.infer<typeof LiveRunSchema>;

/** `GET /api/ingestion/ops`. */
export const IngestionOpsSchema = IngestionStatsSchema.extend({
  live: LiveRunSchema,
  /** The most recent Runs, newest first. */
  runs: z.array(IngestionRunSchema),
});
export type IngestionOps = z.infer<typeof IngestionOpsSchema>;
