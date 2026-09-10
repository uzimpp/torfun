import type { FastifyBaseLogger } from 'fastify';
import type { IngestionFailure, Procurement, IngestionSummary } from '@torfun/types';
import type { Env } from '../config/env';
import { ConflictError, NotFoundError } from '../core/errors';
import type { FindOptions, ProcurementRepository } from '../repositories/procurement.repository';
import { createIngestionDeps, runIngestion, type IngestionDeps } from './egp/pipeline';

/**
 * Application-level policy over the e-GP ingestion pipeline.
 *
 * Owns the "one run at a time" rule and the run's lifecycle. That state used
 * to live in module scope in the route file, which meant the constraint was
 * invisible to anything that wanted to reuse it — and untestable.
 */

export interface StartRunInput {
  eBiddingOnly: boolean;
  maxDownloads?: number;
}

export type SummaryView = IngestionSummary & { agencies: string[] };

export class IngestionService {
  private runInFlight = false;

  /**
   * The pipeline's side-effecting stages, built once from configuration.
   * Overridable so a test can drive a run without the network or a credential.
   */
  private readonly deps: IngestionDeps;

  constructor(
    private readonly repository: ProcurementRepository,
    private readonly env: Env,
    private readonly logger: FastifyBaseLogger,
    deps?: IngestionDeps,
  ) {
    this.deps = deps ?? createIngestionDeps(env);
  }

  async summary(): Promise<SummaryView> {
    const [summary, agencies] = await Promise.all([
      this.repository.summary(),
      this.repository.agencies(),
    ]);
    return { ...summary, agencies, runInProgress: this.runInFlight };
  }

  list(options: FindOptions): Promise<{ items: Procurement[]; total: number }> {
    return this.repository.find(options);
  }

  async get(projectId: string): Promise<Procurement> {
    const record = await this.repository.get(projectId);
    if (!record) throw new NotFoundError(`No ingested project ${projectId}`);
    return record;
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
   */
  startRun(input: StartRunInput): void {
    if (this.runInFlight) {
      throw new ConflictError('An ingestion run is already in progress.');
    }

    this.runInFlight = true;

    void runIngestion(
      this.repository,
      {
        apiKey: this.env.EGP_API_KEY,
        maxDownloads: input.maxDownloads ?? this.env.EGP_MAX_DOWNLOADS_PER_RUN,
        eBiddingOnly: input.eBiddingOnly,
        logger: this.logger,
      },
      this.deps,
    )
      .catch((error: unknown) => {
        this.logger.error({ err: error }, 'egp: ingestion run failed');
      })
      .finally(() => {
        this.runInFlight = false;
      });
  }
}
