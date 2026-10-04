import { resolveProcurementListOptions } from './procurement-list-options';
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type {
  IngestionFailure,
  IngestionOps,
  IngestionSummary,
  Procurement,
  RunCounts,
  RunProgress,
  RunTrigger,
  TokenUsage,
} from '@torfun/types';
import type { Env } from '../config/env';
import { ConflictError, NotFoundError } from '../core/errors';
import type { IngestionLeaseStore } from '../repositories/ingestion-lease.repository';
import type { IngestionRunStore } from '../repositories/ingestion-run.repository';
import type { RunLog } from '../repositories/schedule.repository';
import type {
  FindOptions,
  IngestionStatsSource,
  ProcurementDataSource,
} from '../repositories/procurement.repository';
import { DISCOVERY_MAX_AGE_MS } from './egp/constants';
import {
  createIngestionDeps,
  runIngestion,
  type IngestionDeps,
  type RunResult,
} from './egp/pipeline';
import type { ModelUsage } from './vertex/vertex-ai';
import { isVisibleTo, OFFICER_VISIBLE_OUTCOME, presentTo, type Audience } from './audience';

/**
 * Application-level policy over the e-GP ingestion pipeline.
 *
 * Owns the "one run at a time" rule and the run's lifecycle. The rule is held
 * as a lease in the database rather than a flag in this process, so it is true
 * of every runner: this API, a second instance, a script on a developer's
 * machine. Each Run takes the lease under an id of its own — not the process's
 * — so a second start from this same process is refused like any other.
 */

/** How the lease is kept alive. Defaults suit production; a test shrinks them. */
export interface RunCoordination {
  lease: IngestionLeaseStore;
  /** Told when a Run begins, so a Schedule counts from real starts. */
  runLog: RunLog;
  /** Where each Run is logged when it ends. */
  runs: IngestionRunStore;
  /** Stored history the operations view reads. */
  stats: IngestionStatsSource;
  /** How often a live Run renews its lease. */
  heartbeatMs?: number;
  /** How long a lease outlives its last heartbeat — how long a crashed holder blocks everyone. */
  leaseTtlMs?: number;
  /** The clock the lease and the recorded start are read from; a test drives it. */
  now?: () => Date;
}

/**
 * Whether a Run may still start another record. It may not once its lease was
 * seen to be taken over, nor once a whole lease term has passed without the
 * lease being confirmed — by then another Run may hold it, and a database that
 * cannot be reached to say so is not a reason to carry on regardless.
 */
export function runMayContinue(
  lease: { lost: boolean; confirmedAt: number },
  nowMs: number,
  ttlMs: number,
): boolean {
  return !lease.lost && nowMs - lease.confirmedAt < ttlMs;
}

const DEFAULT_HEARTBEAT_MS = 30_000;
const DEFAULT_LEASE_TTL_MS = 2 * 60_000;
const OPS_WINDOW_MS = 30 * 24 * 60 * 60_000;
const OPS_RUNS = 20;

/** A Run in this process, as its heartbeat and the run log see it. */
interface ActiveRun {
  lost: boolean;
  confirmedAt: number;
  stopRequested: boolean;
  progress: RunProgress | null;
  peakRssBytes: number;
  tokens: TokenUsage;
}

function sampleMemory(active: ActiveRun) {
  const { rss, heapUsed } = process.memoryUsage();
  active.peakRssBytes = Math.max(active.peakRssBytes, rss);
  return { rssBytes: rss, heapUsedBytes: heapUsed, peakRssBytes: active.peakRssBytes };
}

function countsOf(result: RunResult): RunCounts {
  return {
    discovered: result.discovered,
    newRecords: result.newRecords,
    changedRecords: result.changedRecords,
    unchangedRecords: result.unchangedRecords,
    discoverySkipped: result.discoverySkipped,
    discoveryStopped: result.discoveryStopped,
    rejectedNonRegistry: result.rejectedNonRegistry,
    attempted: result.attempted,
    refreshed: result.refreshed,
    archivesRetrieved: result.archivesRetrieved,
    torAnalysed: result.torAnalysed,
    held: result.held,
    dropped: result.dropped,
    failed: result.failed,
    aborted: result.aborted,
    stopped: result.stopped,
  };
}

export interface StartRunInput {
  /** Sweep upstream even if the last sweep is recent. Only an administrator's deliberate choice. */
  forceDiscovery?: boolean;
  /** Retrieve this project and no other (see `RunOptions.onlyProject`). */
  onlyProject?: string;
  /**
   * Work that must happen only if this Run really begins, after the lease is held
   * and before anything is swept: a caller whose change the sweep depends on
   * (lifting a tombstone) makes it here, so a refused start changes nothing. If it
   * throws, no Run begins.
   */
  beforeRun?: () => Promise<void>;
  /** Who started it, for the run log; an administrator unless said otherwise. */
  trigger?: RunTrigger;
}

export type SummaryView = IngestionSummary & { agencies: string[] };

export class IngestionService {
  /**
   * The pipeline's side-effecting stages, built once from configuration.
   * Overridable so a test can drive a run without the network or a credential.
   */
  private readonly deps: IngestionDeps;

  /** The Run going in this process, if any: a stop request reaches it without waiting for a heartbeat, and model calls are counted against it. */
  private active: ActiveRun | null = null;

  /** `makeDeps` is handed where model calls report their tokens. */
  constructor(
    private readonly repository: ProcurementDataSource,
    private readonly env: Env,
    private readonly logger: FastifyBaseLogger,
    private readonly coordination: RunCoordination,
    makeDeps: (onUsage: (usage: ModelUsage) => void) => IngestionDeps = (onUsage) =>
      createIngestionDeps(env, onUsage),
  ) {
    this.deps = makeDeps((usage) => {
      const tokens = this.active?.tokens;
      if (!tokens) return;
      tokens.prompt += usage.prompt;
      tokens.output += usage.output;
      tokens.thoughts += usage.thoughts;
      tokens.total += usage.total;
      tokens.calls += 1;
    });
  }

  private now(): Date {
    return (this.coordination.now ?? (() => new Date()))();
  }

  async summary(): Promise<SummaryView> {
    const [summary, agencies] = await Promise.all([
      this.repository.summary(),
      this.repository.agencies(),
    ]);
    // Read from the lease, not a field on this instance, so a Run started by
    // anything else shows as running here too.
    const live = await this.coordination.lease.current(this.now());
    return {
      ...summary,
      agencies,
      runInProgress: live !== null,
      runStartedAt: live?.acquiredAt ?? null,
      stopRequested: live?.stopRequestedAt != null,
    };
  }

  /** What the operations view shows: the Run going now, from the lease, and stored history. */
  async ops(): Promise<IngestionOps> {
    const now = this.now();
    const [lease, stats, runs] = await Promise.all([
      this.coordination.lease.current(now),
      this.coordination.stats.stats(new Date(now.getTime() - OPS_WINDOW_MS).toISOString()),
      this.coordination.runs.recent(OPS_RUNS),
    ]);
    const live = lease?.live ?? null;
    return {
      live: {
        runInProgress: lease !== null,
        runStartedAt: lease?.acquiredAt ?? null,
        elapsedMs: lease ? Math.max(0, now.getTime() - Date.parse(lease.acquiredAt)) : null,
        stopRequested: lease?.stopRequestedAt != null,
        inFlight: live?.inFlight ?? null,
        queueRemaining: live?.queueRemaining ?? null,
        memory: live?.memory ?? null,
      },
      ...stats,
      runs,
    };
  }

  /**
   * An officer's query is narrowed to analysed TORs here, after whatever they
   * sent, so no `outcome` in the request can widen it back out. The held list
   * comes most urgent first, so a page of it never hides an open tender.
   */
  async list(
    options: FindOptions,
    audience: Audience,
  ): Promise<{ items: Procurement[]; total: number }> {
    const narrowed =
      audience === 'admin' ? options : { ...options, outcome: OFFICER_VISIBLE_OUTCOME };
    const filters = resolveProcurementListOptions(
      narrowed.outcome === 'needs_review' ? { ...narrowed, order: 'urgency' } : narrowed,
    );
    if (!filters) return { items: [], total: 0 };
    const { items, total } = await this.repository.find(filters);
    return { items: items.map((item) => presentTo(audience, item)), total };
  }

  /** Passthrough so the composition root's caller (`server.ts`) never touches a repository directly. */
  async ensureIndexes(): Promise<void> {
    await Promise.all([this.repository.ensureIndexes(), this.coordination.runs.ensureIndexes()]);
  }

  /** A record the audience may not see is reported exactly as one that does not exist. */
  async get(projectId: string, audience: Audience): Promise<Procurement> {
    const record = await this.repository.get(projectId);
    if (!record || !isVisibleTo(audience, record)) {
      throw new NotFoundError(`No ingested project ${projectId}`);
    }
    return presentTo(audience, record);
  }

  /** Admin-only, so it takes no audience: nothing here is filtered by role. */
  recent(limit: number): Promise<Procurement[]> {
    return this.repository.recent(limit);
  }

  failures(): Promise<IngestionFailure[]> {
    return this.repository.listFailures();
  }

  /**
   * Ask the Run now going to stop, gracefully: records already in flight finish,
   * nothing new is taken, the rest stay Queued. The request is written to the
   * lease, so it works whichever API instance the Run is on, and also set at once
   * on this one if the Run is here. Asking again changes nothing.
   */
  async requestStop(by: string): Promise<void> {
    if (!(await this.coordination.lease.requestStop(by, this.now()))) {
      throw new ConflictError('No ingestion run is in progress.');
    }
    if (this.active) this.active.stopRequested = true;
    this.logger.info({ by }, 'egp: an administrator asked the ingestion run to stop');
  }

  /**
   * Kick off a run and return immediately.
   *
   * A full pass takes minutes because of the politeness delays between
   * upstream requests — far longer than a request should hold open — so the
   * work is deliberately not awaited. Progress is observable through the
   * per-project state the admin UI already polls.
   *
   * What is awaited is taking the lease: the caller learns synchronously-enough
   * that a Run is already going (a ConflictError) and does not learn it from a
   * pass that started and silently doubled up.
   */
  async startRun(input: StartRunInput): Promise<void> {
    const { lease } = this.coordination;
    const leaseTtlMs = this.coordination.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    const heartbeatMs = this.coordination.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    const holder = randomUUID();

    const startedAt = this.now();
    if (!(await lease.acquire(holder, startedAt, leaseTtlMs))) {
      throw new ConflictError('An ingestion run is already in progress.');
    }

    // Both only once the lease is ours, so a refused start changes and records
    // nothing. If either fails the Run does not begin: an unrecorded start would
    // leave a schedule to fire again the moment this one finished.
    try {
      await input.beforeRun?.();
      await this.coordination.runLog.markRunStarted(startedAt.toISOString());
    } catch (error) {
      await lease.release(holder).catch(() => undefined);
      throw error;
    }

    // A live Run renews its lease so it outlives the ttl; a crashed one stops,
    // and the lease lapses on its own. The pass cannot be cancelled mid-record,
    // so when renewal shows the lease was taken over — or cannot be confirmed
    // for a whole term — the Run stops at its next record (`runMayContinue`),
    // instead of overlapping whoever holds it now. A single failed renewal
    // (Mongo briefly away) is only logged.
    const held: ActiveRun = {
      lost: false,
      confirmedAt: startedAt.getTime(),
      stopRequested: false,
      progress: null,
      peakRssBytes: 0,
      tokens: { prompt: 0, output: 0, thoughts: 0, total: 0, calls: 0 },
    };
    this.active = held;
    const heartbeat = setInterval(() => {
      const at = this.now();
      const live = {
        inFlight: held.progress?.inFlight ?? [],
        queueRemaining: held.progress?.queueRemaining ?? null,
        memory: { ...sampleMemory(held), sampledAt: at.toISOString() },
      };
      lease.heartbeat(holder, at, leaseTtlMs, live).then(
        (kept) => {
          if (kept) {
            held.confirmedAt = at.getTime();
            // A stop asked for through the lease, from another API instance.
            lease.stopRequested(holder).then(
              (asked) => {
                if (asked) held.stopRequested = true;
              },
              () => undefined,
            );
          } else {
            held.lost = true;
            this.logger.warn('egp: ingestion lease lost while a run was still going');
          }
        },
        (error: unknown) =>
          this.logger.warn({ err: error }, 'egp: ingestion lease heartbeat failed'),
      );
    }, heartbeatMs);
    heartbeat.unref();

    void runIngestion(
      this.repository,
      {
        apiKey: this.env.EGP_API_KEY,
        runners: this.env.EGP_RUNNERS,
        logger: this.logger,
        shouldContinue: () => runMayContinue(held, this.now().getTime(), leaseTtlMs),
        stopRequested: () => held.stopRequested,
        onProgress: (progress) => {
          held.progress = progress;
        },
        discoveryMaxAgeMs: DISCOVERY_MAX_AGE_MS,
        ...(input.forceDiscovery ? { forceDiscovery: true } : {}),
        ...(input.onlyProject ? { onlyProject: input.onlyProject } : {}),
      },
      this.deps,
    )
      .then(
        (result) => ({ counts: countsOf(result), error: null }),
        (error: unknown) => {
          this.logger.error({ err: error }, 'egp: ingestion run failed');
          return { counts: null, error: error instanceof Error ? error.message : String(error) };
        },
      )
      .then((outcome) => {
        clearInterval(heartbeat);
        if (this.active === held) this.active = null;
        // Whether the pass succeeded or threw, the lease is given back; if this
        // release itself fails the ttl still frees it.
        lease.release(holder).catch((error: unknown) => {
          this.logger.warn({ err: error }, 'egp: could not release the ingestion lease');
        });
        const endedAt = this.now();
        sampleMemory(held);
        return this.coordination.runs.record({
          id: holder,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
          trigger: input.trigger ?? 'manual',
          runners: this.env.EGP_RUNNERS,
          ...outcome,
          tokens: held.tokens,
          peakRssBytes: held.peakRssBytes,
        });
      })
      .catch((error: unknown) => {
        this.logger.warn({ err: error }, 'egp: could not log the ingestion run');
      });
  }
}
