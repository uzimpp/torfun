import { resolveProcurementListOptions } from './procurement-list-options';
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { IngestionFailure, Procurement, IngestionSummary } from '@torfun/types';
import type { Env } from '../config/env';
import { ConflictError, NotFoundError } from '../core/errors';
import type { IngestionLeaseStore } from '../repositories/ingestion-lease.repository';
import type { RunLog } from '../repositories/schedule.repository';
import type { FindOptions, ProcurementDataSource } from '../repositories/procurement.repository';
import { DISCOVERY_MAX_AGE_MS } from './egp/constants';
import { createIngestionDeps, runIngestion, type IngestionDeps } from './egp/pipeline';
import { isVisibleTo, OFFICER_VISIBLE_OUTCOME, type Audience } from './audience';

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

export interface StartRunInput {
  eBiddingOnly: boolean;
  /** Sweep upstream even if the last sweep is recent. Only an administrator's deliberate choice. */
  forceDiscovery?: boolean;
  maxDownloads?: number;
}

export type SummaryView = IngestionSummary & { agencies: string[] };

export class IngestionService {
  /**
   * The pipeline's side-effecting stages, built once from configuration.
   * Overridable so a test can drive a run without the network or a credential.
   */
  private readonly deps: IngestionDeps;

  constructor(
    private readonly repository: ProcurementDataSource,
    private readonly env: Env,
    private readonly logger: FastifyBaseLogger,
    private readonly coordination: RunCoordination,
    deps?: IngestionDeps,
  ) {
    this.deps = deps ?? createIngestionDeps(env);
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
    const runInProgress = await this.coordination.lease.isHeld(this.now());
    return { ...summary, agencies, runInProgress };
  }

  /**
   * An officer's query is narrowed to analysed TORs here, after whatever they
   * sent, so no `outcome` in the request can widen it back out.
   */
  list(options: FindOptions, audience: Audience): Promise<{ items: Procurement[]; total: number }> {
    const filters = resolveProcurementListOptions(
      audience === 'admin' ? options : { ...options, outcome: OFFICER_VISIBLE_OUTCOME },
    );
    return filters ? this.repository.find(filters) : Promise.resolve({ items: [], total: 0 });
  }

  /** Passthrough so the composition root's caller (`server.ts`) never touches a repository directly. */
  ensureIndexes(): Promise<void> {
    return this.repository.ensureIndexes();
  }

  /** A record the audience may not see is reported exactly as one that does not exist. */
  async get(projectId: string, audience: Audience): Promise<Procurement> {
    const record = await this.repository.get(projectId);
    if (!record || !isVisibleTo(audience, record)) {
      throw new NotFoundError(`No ingested project ${projectId}`);
    }
    return record;
  }

  /** Admin-only, so it takes no audience: nothing here is filtered by role. */
  recent(limit: number): Promise<Procurement[]> {
    return this.repository.recent(limit);
  }

  failures(): Promise<IngestionFailure[]> {
    return this.repository.listFailures();
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

    // Noted only once the lease is ours, so a refused start records nothing. If
    // the note cannot be written the Run does not begin: an unrecorded start
    // would leave a schedule to fire again the moment this one finished.
    try {
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
    const held = { lost: false, confirmedAt: startedAt.getTime() };
    const heartbeat = setInterval(() => {
      const at = this.now();
      lease.heartbeat(holder, at, leaseTtlMs).then(
        (kept) => {
          if (kept) {
            held.confirmedAt = at.getTime();
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
        maxDownloads: input.maxDownloads ?? this.env.EGP_MAX_DOWNLOADS_PER_RUN,
        eBiddingOnly: input.eBiddingOnly,
        logger: this.logger,
        shouldContinue: () => runMayContinue(held, this.now().getTime(), leaseTtlMs),
        discoveryMaxAgeMs: DISCOVERY_MAX_AGE_MS,
        ...(input.forceDiscovery ? { forceDiscovery: true } : {}),
      },
      this.deps,
    )
      .catch((error: unknown) => {
        this.logger.error({ err: error }, 'egp: ingestion run failed');
      })
      .finally(() => {
        clearInterval(heartbeat);
        // Whether the pass succeeded or threw, the lease is given back; if this
        // release itself fails the ttl still frees it.
        lease.release(holder).catch((error: unknown) => {
          this.logger.warn({ err: error }, 'egp: could not release the ingestion lease');
        });
      });
  }
}
