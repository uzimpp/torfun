import type { FastifyBaseLogger } from 'fastify';
import type {
  ArchiveDocument,
  IngestionFailure,
  Procurement,
  SoftwareJudgement,
  TorAnalysis,
} from '@torfun/types';
import type { Env } from '../../config/env';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import {
  classifyTorDocument,
  type DocumentClassification,
  type ModelStatus,
  type ReadMode,
} from '../vertex/classify-document';
import { createOversizeReaders } from '../vertex/oversize-readers';
import { createModelCall } from '../vertex/vertex-ai';
import { politeTorDelayMs, RateLimitedError, sleep } from './client';
import { mapWithConcurrency } from './concurrency';
import {
  ANALYSIS_CONCURRENCY,
  MAX_ATTEMPTS,
  OPEN_DATA_SWEEP_CALLS,
  RECORD_DEADLINE_MS,
  STALE_PROCESSING_MS,
} from './constants';
import { discoverProjects, type DiscoveryResult, type TombstoneLookup } from './discovery';
import { assignDocumentRoles, type ClassifiedDocument } from './document-roles';
import {
  downloadArchive,
  extractTorPdfs,
  resolveZipId,
  type ExtractionResult,
} from './tor-package';
import { createSiteGate, SiteLatchedError, type SiteGateHold } from './site-gate';
import { decideOutcome } from './decision';
import { buildTombstone } from './tombstone';

/**
 * Orchestrates the two ingestion stages against the repository.
 *
 * Split from the stage modules so those stay pure I/O over the upstream APIs
 * and this owns the policy: what to retrieve, in what order, how failures are
 * recorded, and when to stop.
 */

/**
 * Every side-effecting stage, taken as a parameter.
 *
 * Not for flexibility — there is exactly one real implementation — but so this
 * policy can be tested without the network, a Google credential, or the
 * politeness delays that make a real pass take minutes.
 */
export interface IngestionDeps {
  discoverProjects: (apiKey: string, tombstonedIds: TombstoneLookup) => Promise<DiscoveryResult>;
  /** `signal` is aborted at the record's deadline, which cancels the site request. */
  resolveZipId: (projectId: string, signal?: AbortSignal) => Promise<string | null>;
  downloadArchive: (zipId: string, signal?: AbortSignal) => Promise<Uint8Array>;
  extractTorPdfs: (archive: Uint8Array) => ExtractionResult;
  classifyDocument: (pdf: Buffer) => Promise<DocumentClassification>;
  sleep: (ms: number) => Promise<void>;
  /** Longest one record may take before it is treated as a transport failure. */
  recordDeadlineMs: number;
}

export function createIngestionDeps(env: Env): IngestionDeps {
  const callModel = createModelCall(env);
  const oversizeReaders = createOversizeReaders();
  return {
    discoverProjects,
    resolveZipId,
    downloadArchive,
    extractTorPdfs: (archive) => extractTorPdfs(archive),
    classifyDocument: (pdf) => classifyTorDocument(callModel, pdf, oversizeReaders),
    sleep,
    recordDeadlineMs: RECORD_DEADLINE_MS,
  };
}

class DeadlineExceededError extends Error {
  constructor(ms: number) {
    super(`Record exceeded its ${Math.round(ms / 1000)}s deadline.`);
    this.name = 'DeadlineExceededError';
  }
}

/**
 * What a record's work can tell the deadline about itself.
 *
 * `expired` is how work that outlives its record finds out: it checks it before
 * every write, so a call that finally returns after the record was requeued
 * cannot overwrite that requeue. `siteRequest` is true only while a request to
 * the upstream site is in flight, because that is the one thing that must never
 * be left running.
 */
interface RecordGuard {
  expired: boolean;
  siteRequest: boolean;
  readonly controller: AbortController;
}

/**
 * Run one record's work against a deadline.
 *
 * The work cannot be cancelled in general, so when the deadline wins it keeps
 * running in the background — except for a site request, which is aborted and
 * then waited for. Upstream access is single-file (AGENTS.md), so an abandoned
 * request must not linger into the next record's; and a rate-limit response that
 * beat the abort is still the site saying stop, so it is raised, not swallowed.
 * Waiting is bounded because an aborted request ends promptly. Work stuck
 * anywhere else (the model, say) is not waited for: it touches no upstream site.
 */
async function withDeadline(
  work: () => Promise<void>,
  ms: number,
  guard: RecordGuard,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      guard.expired = true;
      reject(new DeadlineExceededError(ms));
    }, ms);
  });
  const running = work();
  try {
    await Promise.race([running, deadline]);
  } catch (error) {
    if (!(error instanceof DeadlineExceededError)) throw error;

    const requestInFlight = guard.siteRequest;
    guard.controller.abort();
    if (requestInFlight) {
      let late: unknown;
      await running.catch((caught: unknown) => {
        late = caught;
      });
      if (late instanceof RateLimitedError) throw late;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface RunOptions {
  apiKey: string;
  logger: FastifyBaseLogger;
  /**
   * Asked before each record. A Run cannot be cancelled mid-record, so this is
   * where one that no longer holds the right to run — its lease was taken
   * over — stops rather than overlap another Run's requests to the site.
   */
  shouldContinue?: () => boolean;
  /**
   * A discovery sweep younger than this is not repeated: it is the same ~270
   * queries for the same answer, and the open-data API rate limits them. Unset
   * means always sweep.
   */
  discoveryMaxAgeMs?: number;
  /** Sweep regardless of how recent the last one was. */
  forceDiscovery?: boolean;
  /**
   * Retrieve this project and no other. Discovery still runs as asked, because it
   * is what brings the project's feed fields back; what changes is that the queue
   * is not worked through, so the site is asked about one project. A project
   * Discovery did not bring back is reported as a failure rather than skipped.
   */
  onlyProject?: string;
  /**
   * Records worked on at once, default one. More than one shares the upstream
   * site through a single gate (see `site-gate.ts`): the site still sees one
   * request at a time with the same pause, and only the reading by the model,
   * which touches no upstream site, overlaps.
   */
  runners?: number;
  /**
   * Asked before each record, like `shouldContinue`, but for an administrator's
   * request to stop. Graceful: a record already in flight is not interrupted,
   * and nothing further is taken.
   */
  stopRequested?: () => boolean;
}

export interface RunResult {
  discovered: number;
  newRecords: number;
  /** Seen before, and the agency's data for them is different now. */
  changedRecords: number;
  /** Seen again with nothing the agency owns moved. */
  unchangedRecords: number;
  /** This Run made no discovery sweep (the last was recent, or the day's allowance is too low). */
  discoverySkipped: boolean;
  /**
   * Why a sweep that began did not finish: the open-data API refused it, or it
   * stopped with the day's reserve in hand. Null when it finished or never began.
   */
  discoveryStopped: 'rate_limited' | 'budget' | null;
  rejectedNonRegistry: number;
  attempted: number;
  /** Announcement archives successfully retrieved, whatever was in them. */
  archivesRetrieved: number;
  /** Retrievals whose TOR was read and shown to officers (a confident software answer). */
  torAnalysed: number;
  /** Retrievals whose TOR was read but left for an administrator to decide. */
  held: number;
  /** Retrievals whose TOR was read and dropped as not software; only a tombstone remains. */
  dropped: number;
  failed: number;
  aborted: boolean;
  /** Why the Run ended before the queue did, where an administrator is the reason; else null. */
  stopped: 'admin' | null;
  failures: IngestionFailure[];
  ranAt: string;
}

function sameUtcDay(iso: string, nowMs: number): boolean {
  return iso.slice(0, 10) === new Date(nowMs).toISOString().slice(0, 10);
}

/** Records read from the queue at a time while it is being collected. */
const SELECTION_PAGE = 200;

/**
 * Every record worth spending an upstream request on, newest announcement first.
 *
 * There is no cap: a Run works through the whole queue, so what is selected is
 * all of it, in the order `find` gives, which means a Run that is stopped early
 * has done the most recent part. Everything in the queue is e-bidding, because
 * discovery admits nothing else. What keeps the site safe is not how many, but how (single file, paused,
 * stopped at once by a refusal).
 */
async function selectForRetrieval(repository: ProcurementStore): Promise<Procurement[]> {
  const queue: Procurement[] = [];
  for (let offset = 0; ; offset += SELECTION_PAGE) {
    const { items } = await repository.find({
      state: 'Queued',
      // In the query, not filtered afterwards: an exhausted record must not be
      // read into the queue only to be skipped.
      attemptsBelow: MAX_ATTEMPTS,
      limit: SELECTION_PAGE,
      offset,
    });
    queue.push(...items);
    if (items.length < SELECTION_PAGE) return queue;
  }
}

/** The one project a restricted Run is for, if it is Queued and may still be tried. */
async function selectOne(repository: ProcurementStore, projectId: string): Promise<Procurement[]> {
  const record = await repository.get(projectId);
  return record && record.state === 'Queued' && record.attempts < MAX_ATTEMPTS ? [record] : [];
}

interface AnalysedArchive {
  documents: ArchiveDocument[];
  analysis: TorAnalysis | null;
  /** What the model concluded about the main TOR's work; null exactly when `analysis` is. */
  judgement: SoftwareJudgement | null;
  /** How the main TOR was read; only a whole-PDF reading may act on its own. */
  readMode: ReadMode | undefined;
  torAmbiguous: boolean;
  /** The stage the main TOR shows, or null where it shows none. */
  procurementStatus: ModelStatus | null;
  /** True where at least one candidate could not be read at all. */
  anyUnreadable: boolean;
}

/**
 * Classify every candidate PDF, then decide between them.
 *
 * One call per document (ADR-0003): with nothing stored, the bytes travel as
 * base64 and several in one request would breach the size limit. Only members
 * that matched a TOR filename pattern are sent — reading the rest of an archive
 * would cost tokens to be told what we already knew.
 */
async function analyseArchive(
  extraction: ExtractionResult,
  classifyDocument: IngestionDeps['classifyDocument'],
): Promise<AnalysedArchive> {
  const byMember = new Map<string, DocumentClassification>();

  // Two at a time. This is Gemini, not the upstream site, so the politeness
  // terms do not apply — only the downloads are held to one at a time. Results
  // come back in archive order, which `assignDocumentRoles` relies on.
  const candidates = await mapWithConcurrency(
    extraction.torFiles,
    ANALYSIS_CONCURRENCY,
    async (pdf): Promise<ClassifiedDocument> => {
      const classification = await classifyDocument(
        // A view over the extracted bytes, not a copy: a copy doubles every PDF in memory.
        Buffer.from(pdf.payload.buffer, pdf.payload.byteOffset, pdf.payload.byteLength),
      );
      byMember.set(pdf.member, classification);
      return {
        member: pdf.member,
        filename: pdf.filename,
        bytes: pdf.bytes,
        namePattern: pdf.namePattern,
        isTor: classification.isTor,
        torKind: classification.torKind,
        whatThisIs: classification.whatThisIs,
        unreadable: classification.unreadable,
        readMode: classification.readMode,
        readNote: classification.readNote,
      };
    },
  );

  const { documents, mainTor, ambiguous } = assignDocumentRoles(candidates);

  return {
    documents,
    analysis: mainTor ? (byMember.get(mainTor.member)?.analysis ?? null) : null,
    judgement: mainTor ? (byMember.get(mainTor.member)?.judgement ?? null) : null,
    readMode: mainTor ? byMember.get(mainTor.member)?.readMode : undefined,
    procurementStatus: mainTor ? (byMember.get(mainTor.member)?.procurementStatus ?? null) : null,
    torAmbiguous: ambiguous,
    anyUnreadable: candidates.some((candidate) => candidate.unreadable !== undefined),
  };
}

/**
 * Run one full ingestion pass: discover, then retrieve and read TOR packages
 * for the most promising queued projects.
 *
 * Failures never abort the pass except a rate limit, which stops it entirely —
 * the correct response to a site signalling "stop" is to stop, not to retry
 * around it. Everything else is logged for Site Administrator review and the
 * pass continues.
 */
export async function runIngestion(
  repository: ProcurementStore,
  options: RunOptions,
  deps: IngestionDeps,
): Promise<RunResult> {
  const { logger } = options;

  // Runs never overlap, so anything still Processing and long silent belongs to
  // a run that died. Done first, before discovery can take minutes or fail.
  const requeued = await repository.requeueStale(
    new Date(Date.now() - STALE_PROCESSING_MS).toISOString(),
  );
  if (requeued > 0) logger.warn({ requeued }, 'egp: requeued records stuck in Processing');

  const lastSweep = await repository.lastDiscoveryAt();
  const sweepIsRecent =
    options.discoveryMaxAgeMs !== undefined &&
    !options.forceDiscovery &&
    lastSweep !== null &&
    Date.now() - Date.parse(lastSweep) < options.discoveryMaxAgeMs;

  // The open-data key has a hard daily allowance. If what it last reported, today,
  // is less than a sweep costs, a sweep would only be refused part-way — so none
  // is tried, whatever an administrator asked for. A reading from an earlier day
  // is taken to have reset.
  const knownQuota = await repository.openDataQuota();
  const quotaTooLow =
    knownQuota !== null &&
    sameUtcDay(knownQuota.observedAt, Date.now()) &&
    knownQuota.remainingDay < OPEN_DATA_SWEEP_CALLS;

  const skipSweep = sweepIsRecent || quotaTooLow;

  let discovery: DiscoveryResult;
  let sync = { created: 0, changed: 0, unchanged: 0 };
  let discoveryStopped: RunResult['discoveryStopped'] = null;

  if (skipSweep) {
    // Either the answer has not had time to change, or there is no allowance left
    // to ask again with. The queue already holds what the last sweep found, so go
    // straight to retrieving from it.
    logger.info(
      { lastSweep, remainingToday: quotaTooLow ? knownQuota?.remainingDay : undefined },
      quotaTooLow
        ? 'egp: open-data allowance too low for a sweep today, skipping it'
        : 'egp: last discovery sweep is recent, skipping it',
    );
    discovery = {
      records: [],
      rejected: [],
      notEBidding: 0,
      tombstoned: 0,
      resolutions: [],
      failures: [],
      rateLimited: false,
      budgetReached: false,
      quota: null,
      ranAt: lastSweep ?? new Date().toISOString(),
    };
  } else {
    logger.info('egp: starting discovery sweep');
    // A project that has a tombstone is not admitted, whatever the feed says about
    // it: the tombstone is the decision, until an administrator lifts it.
    discovery = await deps.discoverProjects(options.apiKey, (ids) => repository.tombstonedIds(ids));
    sync = await repository.upsertMany(discovery.records);
    await repository.recordFailures(discovery.failures);
    if (discovery.quota) await repository.recordOpenDataQuota(discovery.quota);

    if (discovery.rateLimited || discovery.budgetReached) {
      // Cut short. What it found is kept, but it is not a finished sweep: marking
      // it done would make the next Run skip the agencies it never reached.
      discoveryStopped = discovery.rateLimited ? 'rate_limited' : 'budget';
      logger.warn(
        { stopped: discoveryStopped, remainingToday: discovery.quota?.remainingDay },
        'egp: discovery sweep stopped early; retrieval from the queue carries on',
      );
    } else {
      await repository.markRun(discovery.ranAt);
    }
  }
  const newRecords = sync.created;

  logger.info(
    {
      discovered: discovery.records.length,
      newRecords,
      changed: sync.changed,
      unchanged: sync.unchanged,
      rejected: discovery.rejected.length,
      notEBidding: discovery.notEBidding,
      tombstoned: discovery.tombstoned,
      failures: discovery.failures.length,
    },
    'egp: discovery complete',
  );

  const failures: IngestionFailure[] = [...discovery.failures];

  const syncCounts = {
    newRecords,
    changedRecords: sync.changed,
    unchangedRecords: sync.unchanged,
    discoverySkipped: skipSweep,
    discoveryStopped,
  };

  const candidates = options.onlyProject
    ? await selectOne(repository, options.onlyProject)
    : await selectForRetrieval(repository);

  let archivesRetrieved = 0;
  let torAnalysed = 0;
  let held = 0;
  let dropped = 0;
  let failed = 0;
  let attempted = 0;
  let aborted = false;

  const note = async (failure: IngestionFailure) => {
    failures.push(failure);
    await repository.recordFailures([failure]);
  };

  if (options.onlyProject && candidates.length === 0) {
    // Asked for one project and there is none to read: say so, or the
    // administrator who asked is left to wonder why nothing happened.
    await note({
      projectId: options.onlyProject,
      projectName: '-',
      stage: 'discovery',
      error:
        'The project was not read: this sweep did not bring it back (it may no longer be in the feed, or the sweep stopped early).',
      at: new Date().toISOString(),
    });
  }

  const queue = [...candidates];
  const gate = createSiteGate({ pause: () => deps.sleep(politeTorDelayMs()) });
  let stopped = false;
  let stoppedBy: 'admin' | null = null;

  /** One record, from its site requests to its stored outcome. Never throws. */
  const processRecord = async (record: Procurement): Promise<void> => {
    attempted += 1;
    await repository.transition(record.projectId, 'downloading');

    // Where the record had got to, so a failure is logged against the step that
    // actually failed rather than always the download.
    let stage: IngestionFailure['stage'] = 'info';
    const guard: RecordGuard = {
      expired: false,
      siteRequest: false,
      controller: new AbortController(),
    };
    // Marks the span of a call to the upstream site, so a deadline knows whether
    // there is a request it must cancel and wait for.
    const site = async <T>(call: () => Promise<T>): Promise<T> => {
      guard.siteRequest = true;
      try {
        return await call();
      } finally {
        guard.siteRequest = false;
      }
    };

    let hold: SiteGateHold | undefined;
    // Free the gate once the site is done with. A pause follows only where
    // another site section is coming; the model's reading is outside the gate.
    const endSiteSection = () =>
      hold?.release({ pauseAfter: queue.length > 0 || gate.pending > 0 }) ?? Promise.resolve();

    try {
      // Waiting for the gate is not the record's time: its deadline starts once
      // it has the site to itself.
      hold = await gate.acquire();
      await withDeadline(
        async () => {
          const zipId = await site(() =>
            deps.resolveZipId(record.projectId, guard.controller.signal),
          );
          if (guard.expired) return;

          if (zipId === null) {
            // A real answer from upstream, not a transport error: this project
            // published no TOR package. Recorded as Failed because an admin is
            // left with nothing to read, but distinguished by its outcome.
            const error = 'No zipId in the announcement response — no TOR package published.';
            await endSiteSection();
            await note({
              projectId: record.projectId,
              projectName: record.projectName,
              stage: 'info',
              error,
              at: new Date().toISOString(),
            });
            await repository.transition(record.projectId, 'no_tor_package', {}, error);
            failed += 1;
          } else {
            stage = 'download';
            const archive = await site(() => deps.downloadArchive(zipId, guard.controller.signal));
            if (guard.expired) return;
            await endSiteSection();
            stage = 'extract';
            const extraction = deps.extractTorPdfs(archive);
            archivesRetrieved += 1;

            if (extraction.unsafeSkipped.length > 0) {
              // Never silently dropped: a path-traversal attempt in a government
              // archive is exactly the thing an administrator should see.
              await note({
                projectId: record.projectId,
                projectName: record.projectName,
                stage: 'extract',
                error: `Archive members rejected by the path-traversal guard: ${extraction.unsafeSkipped.join(', ')}`,
                at: new Date().toISOString(),
              });
            }

            // The record only counts as being read once there is something to read.
            if (extraction.torFiles.length > 0) {
              await repository.transition(record.projectId, 'analysing');
            }

            stage = 'analysis';
            const analysed = await analyseArchive(extraction, deps.classifyDocument);
            if (guard.expired) return;

            // Note what is NOT here: extraction.torFiles carries the PDF payloads,
            // and they stop at this line. Only the manifest is persisted (ADR-0002).
            const patch: Partial<Procurement> = {
              zipId,
              documents: analysed.documents,
              analysis: analysed.analysis,
              torAmbiguous: analysed.torAmbiguous,
            };

            // The model's reading of the stage fills a gap and never fills over a
            // stage the feed named: only a record nobody has read is touched.
            if (analysed.procurementStatus !== null && record.statusSource === null) {
              patch.status = analysed.procurementStatus;
              patch.statusSource = 'ai';
            }

            if (analysed.analysis !== null && analysed.judgement !== null) {
              // The TOR was read either way. What the model's judgement may do is
              // decided in one place: only a confident, whole-document answer
              // shows or drops a record, and anything else is held for a person.
              const decision = decideOutcome({
                ...analysed.judgement,
                partialRead: analysed.readMode !== 'pdf',
              });
              if (decision.result === 'drop') {
                // Dropped: nothing read from the document is kept, only the
                // decision and the quote that made it.
                await repository.tombstone(
                  buildTombstone({
                    projectId: record.projectId,
                    reason: 'ai_not_software',
                    evidence: analysed.judgement.reason,
                    promptVersion: analysed.analysis.promptVersion,
                    decidedBy: null,
                    now: new Date(),
                  }),
                );
                dropped += 1;
              } else {
                await repository.transition(
                  record.projectId,
                  decision.outcome,
                  decision.result === 'held'
                    ? { ...patch, holdReason: decision.holdReason }
                    : patch,
                );
                if (decision.result === 'held') held += 1;
                else torAnalysed += 1;
              }
            } else if (analysed.anyUnreadable) {
              // The archive was retrieved; only the reading failed. Kept Completed
              // so a retry re-reads what is already here instead of re-downloading
              // from a site that asked not to be crawled.
              const error = `Archive retrieved but no candidate could be read: ${analysed.documents
                .filter((document) => document.role === 'unreadable')
                .map((document) => `${document.filename} (${document.note})`)
                .join('; ')}`;
              await note({
                projectId: record.projectId,
                projectName: record.projectName,
                stage: 'analysis',
                error,
                at: new Date().toISOString(),
              });
              await repository.transition(record.projectId, 'analysis_failed', patch);
            } else {
              await note({
                projectId: record.projectId,
                projectName: record.projectName,
                stage: 'extract',
                error: `Archive downloaded (${extraction.members.length} members) but none of its documents is a TOR.`,
                at: new Date().toISOString(),
              });
              await repository.transition(record.projectId, 'no_tor_in_archive', patch);
            }
          }
        },
        deps.recordDeadlineMs,
        guard,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof SiteLatchedError) {
        // Another runner met the refusal. This one never reached the site, so it
        // has nothing to log and nothing to count: the record goes back, whole.
        await repository.transition(record.projectId, 'queued', {});
        attempted -= 1;
        stopped = true;
        return;
      }

      if (error instanceof RateLimitedError) {
        gate.latch();
        // The site is telling us to stop. Stop — leaving the rest Queued for a
        // later run rather than pushing through. This record did nothing wrong,
        // so it goes back to the queue without spending one of its attempts.
        await repository.transition(record.projectId, 'queued', {}, message);
        await note({
          projectId: record.projectId,
          projectName: record.projectName,
          stage,
          error: message,
          at: new Date().toISOString(),
        });
        failed += 1;
        aborted = true;
        stopped = true;
        logger.warn({ projectId: record.projectId }, 'egp: rate limited, aborting run');
        return;
      }

      await note({
        projectId: record.projectId,
        projectName: record.projectName,
        stage,
        error: message,
        at: new Date().toISOString(),
      });
      // A transport failure leaves the record Queued for the next run and
      // spends an attempt; the last attempt ends it (ADR-0006).
      const attempts = record.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await repository.transition(
        record.projectId,
        exhausted ? 'abandoned' : 'error',
        { attempts },
        exhausted ? `${message} (attempt ${attempts} of ${MAX_ATTEMPTS}, giving up)` : message,
      );
      failed += 1;
    } finally {
      // Whatever ended the record, the gate is not left held.
      await hold?.release();
    }
  };

  const runner = async (): Promise<void> => {
    while (!stopped) {
      if (options.stopRequested?.()) {
        // Nothing is taken from the queue: what is left stays Queued, no attempt spent.
        stoppedBy = 'admin';
        stopped = true;
        aborted = true;
        logger.info('egp: run stopped by an administrator; the rest stay Queued');
        return;
      }
      const record = queue.shift();
      if (!record) return;
      if (options.shouldContinue && !options.shouldContinue()) {
        aborted = true;
        stopped = true;
        logger.warn('egp: run stopped before its next record; the rest stay Queued');
        return;
      }
      await processRecord(record);
    }
  };

  const runners = Math.max(1, Math.min(options.runners ?? 1, queue.length));
  await Promise.all(Array.from({ length: runners }, runner));

  logger.info(
    { attempted, archivesRetrieved, torAnalysed, held, dropped, failed, aborted },
    'egp: run complete',
  );

  return {
    discovered: discovery.records.length,
    ...syncCounts,
    rejectedNonRegistry: discovery.rejected.length,
    attempted,
    archivesRetrieved,
    torAnalysed,
    held,
    dropped,
    failed,
    aborted,
    stopped: stoppedBy,
    failures,
    ranAt: discovery.ranAt,
  };
}
