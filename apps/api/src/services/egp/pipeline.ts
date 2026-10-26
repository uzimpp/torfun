import type { FastifyBaseLogger } from 'fastify';
import type { IngestionFailure, Procurement, RunProgress } from '@torfun/types';
import type { Env } from '../../config/env';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import { classifyTorDocument, type DocumentClassification } from '../vertex/classify-document';
import { readInvitationPdf } from '../vertex/invitation-reader';
import { createOversizeReaders } from '../vertex/oversize-readers';
import { createModelCall, type ModelUsage } from '../vertex/vertex-ai';
import { createAnalysisTasks } from './analysis-task';
import type { AnnouncementClient } from './announcement-client';
import { createAnnouncementClient } from './announcement-client';
import { politeTorDelayMs, RateLimitedError, sleep } from './client';
import { createLimiter } from './concurrency';
import { MAX_ATTEMPTS, RECORD_DEADLINE_MS, STALE_PROCESSING_MS } from './constants';
import {
  bangkokToday,
  discoverProjects,
  type DiscoveryResult,
  type SweepBatch,
  type SweepContext,
} from './discovery';
import { readInvitationDocuments, type InvitationResult } from './invitation';
import { createLiveView, DISCOVERY_SLOT, type LiveView } from './live-view';
import { createRetrievalQueue, type RetrievalQueue } from './retrieval-queue';
import type { RetrievalDeps } from './retrieval-turn';
import { createRetrievalWorker } from './retrieval-worker';
import { createRunControl, runEnding, type RunControl } from './run-control';
import { createRunLedger } from './run-ledger';
import { createSiteGate, type SiteGate } from './site-gate';
import {
  downloadArchive,
  extractInvitationPdfs,
  extractTorPdfs,
  resolveZipId,
  type ExtractionResult,
} from './tor-package';

/**
 * Orchestrates the ingestion stages — Discovery, Retrieval, Analysis — against
 * the repository.
 *
 * Split from the stage modules so those stay pure I/O over the upstream APIs
 * and this owns the policy: what to retrieve, in what order, how failures are
 * recorded, and when to stop. `runIngestion` wires a Run from its parts:
 *
 *  - `run-control.ts`: whether the Run may go on, and why it stopped;
 *  - `retrieval-queue.ts`: the work waiting for the gate, and the waiting room;
 *  - `retrieval-worker.ts` and `retrieval-turn.ts`: one project's gate turn;
 *  - `analysis-task.ts`: reading a fetched Archive and storing the outcome;
 *  - `run-ledger.ts`: what the records came to, and the failures logged;
 *  - `live-view.ts`: what the administrator sees in progress.
 */

/**
 * Every side-effecting stage, taken as a parameter.
 *
 * Not for flexibility — there is exactly one real implementation — but so this
 * policy can be tested without the network, a Google credential, or the
 * politeness delays that make a real pass take minutes.
 */
export interface IngestionDeps {
  /** Every request it makes to the site goes through `context.site`, the Run's one gate. */
  discoverProjects: (context: SweepContext) => Promise<DiscoveryResult>;
  /** `signal` is aborted at the record's deadline, which cancels the site request. */
  resolveZipId: (projectId: string, signal?: AbortSignal) => Promise<string | null>;
  downloadArchive: (zipId: string, signal?: AbortSignal) => Promise<Uint8Array>;
  extractTorPdfs: (archive: Uint8Array) => ExtractionResult;
  classifyDocument: (pdf: Buffer) => Promise<DocumentClassification>;
  /** Reads the bid date off the archive's invitation announcement, if it carries one. */
  readInvitation: (archive: Uint8Array, projectId: string) => Promise<InvitationResult>;
  /** The project's timeline and detail; the detail is asked first, only where it was never read. */
  announcements: AnnouncementClient;
  sleep: (ms: number) => Promise<void>;
  /**
   * Longest one record's turn at the site may take before it is treated as a
   * transport failure; its Analysis has a bound of the same length.
   */
  recordDeadlineMs: number;
}

export function createIngestionDeps(
  env: Env,
  onUsage?: (usage: ModelUsage) => void,
): IngestionDeps {
  const callModel = createModelCall(env, onUsage);
  const oversizeReaders = createOversizeReaders();
  return {
    discoverProjects,
    resolveZipId,
    downloadArchive,
    extractTorPdfs: (archive) => extractTorPdfs(archive),
    classifyDocument: (pdf) => classifyTorDocument(callModel, pdf, oversizeReaders),
    readInvitation: (archive, projectId) =>
      readInvitationDocuments(
        { extract: extractInvitationPdfs, read: (pdf) => readInvitationPdf(callModel, pdf) },
        archive,
        projectId,
      ),
    announcements: createAnnouncementClient(),
    sleep,
    recordDeadlineMs: RECORD_DEADLINE_MS,
  };
}

export interface RunOptions {
  logger: FastifyBaseLogger;
  /**
   * Asked before each site request and each record. A Run cannot be cancelled
   * mid-record, so this is where one that no longer holds the right to run —
   * its lease was taken over — stops rather than overlap another Run's requests
   * to the site.
   */
  shouldContinue?: () => boolean;
  /**
   * Retrieve this project and no other, with no discovery sweep (ADR-0020): the
   * site is asked about one project. A project that is not Queued with attempts
   * left is reported as a failure rather than skipped.
   */
  onlyProject?: string;
  /**
   * Calls to the model in flight at once across the whole Run, default eight.
   * Also the number of Archives that may be held in memory waiting for, or
   * under, Analysis (ADR-0020).
   */
  analysisConcurrency?: number;
  /**
   * Asked like `shouldContinue`, but for an administrator's request to stop.
   * Graceful: a record already in its turn finishes it, an Archive already
   * fetched is analysed and stored, and nothing further is asked of the site.
   */
  stopRequested?: () => boolean;
  /** Told whenever a record is taken up, changes stage, or is done with. */
  onProgress?: (progress: RunProgress) => void;
}

export interface RunResult {
  discovered: number;
  newRecords: number;
  /** Seen before, and the agency's data for them is different now. */
  changedRecords: number;
  /** Seen again with nothing the agency owns moved. */
  unchangedRecords: number;
  /**
   * Why a sweep that began did not finish: the site refused it, or stopped
   * answering. Null when it finished, never began, or was stopped by the Run
   * itself (`stopped` says why).
   */
  discoveryStopped: 'rate_limited' | 'unreachable' | 'unavailable' | null;
  attempted: number;
  /** Projects already read whose timeline was read again to refresh their status. */
  refreshed: number;
  /** Announcement archives successfully retrieved, whatever was in them. */
  archivesRetrieved: number;
  /** Retrievals whose TOR was read and shown to officers (a confident software answer). */
  torAnalysed: number;
  /** Retrievals whose TOR was read but left for an administrator to decide. */
  held: number;
  /** Retrievals whose TOR was read and dropped as not software; only a tombstone remains. */
  dropped: number;
  failed: number;
  /**
   * The site refused (429/403), in discovery or retrieval, and the Run stopped
   * there. The run log shows it as failed. An administrator's stop is `stopped`.
   */
  aborted: boolean;
  /** Why the Run ended before the queue did, where an administrator is the reason; else null. */
  stopped: 'admin' | null;
  failures: IngestionFailure[];
  ranAt: string;
}

/** Records read from the store at a time while a list of work is being collected. */
const SELECTION_PAGE = 200;

async function collectPages(
  page: (offset: number) => Promise<Procurement[]>,
): Promise<Procurement[]> {
  const all: Procurement[] = [];
  for (let offset = 0; ; offset += SELECTION_PAGE) {
    const items = await page(offset);
    all.push(...items);
    if (items.length < SELECTION_PAGE) return all;
  }
}

/**
 * Every record worth spending an upstream request on, newest announcement first.
 *
 * There is no cap: a Run works through the whole queue, so what is selected is
 * all of it, in the order `find` gives, which means a Run that is stopped early
 * has done the most recent part. Everything in the queue is e-bidding, because
 * discovery admits nothing else. What keeps the site safe is not how many, but how (single file, paused,
 * stopped at once by a refusal).
 */
function selectForRetrieval(repository: ProcurementStore): Promise<Procurement[]> {
  return collectPages(
    async (offset) =>
      (
        await repository.find({
          state: 'Queued',
          // In the query, not filtered afterwards: an exhausted record must not be
          // read into the queue only to be skipped.
          attemptsBelow: MAX_ATTEMPTS,
          limit: SELECTION_PAGE,
          offset,
        })
      ).items,
  );
}

/** Records already read whose timeline is due again, the longest unchecked first. */
function selectForRefresh(repository: ProcurementStore): Promise<Procurement[]> {
  return collectPages((offset) => repository.dueForTimeline({ limit: SELECTION_PAGE, offset }));
}

/** The one project a restricted Run is for, if it is Queued and may still be tried. */
async function selectOne(repository: ProcurementStore, projectId: string): Promise<Procurement[]> {
  const record = await repository.get(projectId);
  return record && record.state === 'Queued' && record.attempts < MAX_ATTEMPTS ? [record] : [];
}

/**
 * Wall time with at least one call in flight, overlapping calls counted once.
 * For the Run's timing log: how long the model's reading kept something busy.
 */
function overlapTimer(now: () => number = Date.now) {
  let open = 0;
  let since = 0;
  let total = 0;
  return {
    async time<T>(call: () => Promise<T>): Promise<T> {
      if (open++ === 0) since = now();
      try {
        return await call();
      } finally {
        if (--open === 0) total += now() - since;
      }
    },
    get ms() {
      return total + (open > 0 ? now() - since : 0);
    },
  };
}
/** What a Run's Discovery came to: the sweep, and how its records compared with the store. */
interface Sweep {
  result: DiscoveryResult;
  sync: { created: number; changed: number; unchanged: number };
}

/**
 * Discovery: sweep the feed through the Run's gate, saving each agency-day as
 * soon as it is read and handing each project new to the store to Retrieval.
 */
async function runDiscovery(run: {
  repository: ProcurementStore;
  logger: FastifyBaseLogger;
  discoverProjects: IngestionDeps['discoverProjects'];
  gate: SiteGate;
  control: RunControl;
  live: LiveView;
  queue: RetrievalQueue;
  failures: IngestionFailure[];
}): Promise<Sweep> {
  const { repository, logger, gate, control, failures } = run;
  logger.info('egp: starting discovery sweep');
  // One line in the live view while it runs; it has no project of its own.
  const reading = (what: string) =>
    run.live.show({
      slot: DISCOVERY_SLOT,
      projectId: '-',
      projectName: what,
      stage: 'discovery',
      fresh: true,
      since: new Date().toISOString(),
    });
  reading('-');

  let sync = { created: 0, changed: 0, unchanged: 0 };
  let saved = false;
  const save = async (batch: SweepBatch) => {
    saved = true;
    const summary = await repository.upsertMany(batch.records);
    sync = {
      created: sync.created + summary.created,
      changed: sync.changed + summary.changed,
      unchanged: sync.unchanged + summary.unchanged,
    };
    failures.push(...batch.failures);
    await repository.recordFailures(batch.failures);
    // Covers exactly the days read in full, even if the sweep stops later.
    await repository.recordFeedCursor(batch.cursor);
    // Only a project new to the store is fresh work; one seen before is
    // already in the queue if it is Queued, or due a refresh if it is not.
    const byId = new Map(batch.records.map((record) => [record.projectId, record]));
    for (const id of summary.createdIds) {
      const record = byId.get(id);
      if (record) run.queue.enqueue({ record, fresh: true });
    }
  };

  const result = await run.discoverProjects({
    site: async (tier, call) => {
      // A stop asked for since the last request closes the gate, which then
      // turns this one away.
      control.noticeStop();
      const hold = await gate.acquire(tier);
      try {
        return await control.askSite(call);
      } catch (error) {
        // The site said stop: nothing else this Run may ask it anything.
        if (error instanceof RateLimitedError) control.halt('refused');
        throw error;
      } finally {
        await hold.release();
      }
    },
    cursor: await repository.feedCursor(),
    // A project that has a tombstone is not admitted, whatever the feed says
    // about it: the tombstone is the decision, until an administrator lifts it.
    tombstonedIds: (ids) => repository.tombstonedIds(ids),
    today: bangkokToday(),
    save,
    reading,
  });
  // A sweep that handed nothing to `save` on the way is stored whole here.
  if (!saved) await save(result);

  if (result.rateLimited) {
    // Cut short by a refusal, its own or Retrieval's. What it found is kept,
    // but it is not a finished sweep.
    logger.warn('egp: the site refused; discovery stopped there');
    control.halt('refused');
  } else if (result.unreachable) {
    // Normally already stopped, and logged, where the silence was counted
    // (`askSite`); stopping again changes nothing.
    control.halt('unreachable');
  } else if (result.complete) {
    await repository.markRun(result.ranAt);
  }

  logger.info(
    {
      discovered: result.records.length,
      newRecords: sync.created,
      changed: sync.changed,
      unchanged: sync.unchanged,
      notEBidding: result.notEBidding,
      tombstoned: result.tombstoned,
      truncated: result.truncated,
      failures: result.failures.length,
    },
    'egp: discovery complete',
  );
  return { result, sync };
}

/**
 * Run one full ingestion pass: Discovery, Retrieval and Analysis side by side
 * (ADR-0020).
 *
 *  - Discovery sweeps the feed and hands each project new to the store to
 *    Retrieval as soon as its agency-day is saved.
 *  - Retrieval is one worker. Its queue starts with the projects never read,
 *    then those due a timeline refresh, and Discovery's new projects join the
 *    never-read ones, ahead of every refresh. Each project is one gate turn.
 *  - Analysis takes each fetched Archive as its own task, so the worker goes
 *    straight on to its next turn while the model reads.
 *
 * Discovery and the one Retrieval worker share the one gate, so the site still
 * sees a single file of requests with a pause after each; between them the gate
 * always has its next turn waiting. The Run ends once Discovery has finished,
 * the queue is empty and every Analysis has settled.
 *
 * Failures never end the pass except a refusal from the site, which stops it
 * entirely: the correct response to a site signalling "stop" is to stop, not to
 * retry around it. Everything else is logged for Site Administrator review and
 * the pass continues.
 */
export async function runIngestion(
  repository: ProcurementStore,
  options: RunOptions,
  deps: IngestionDeps,
): Promise<RunResult> {
  const { logger } = options;
  const startedAt = Date.now();

  // Runs never overlap, so anything still Processing and long silent belongs to
  // a run that died. Done first, before anything else is taken up.
  const requeued = await repository.requeueStale(
    new Date(Date.now() - STALE_PROCESSING_MS).toISOString(),
  );
  if (requeued > 0) logger.warn({ requeued }, 'egp: requeued records stuck in Processing');

  // One gate for the whole Run: the feed Discovery reads and the archives
  // Retrieval fetches are the same site, so they share its terms (site-gate.ts).
  const gate = createSiteGate({ pause: () => deps.sleep(politeTorDelayMs()) });

  // Every call to the model goes through here: the limiter bounds how many are
  // in flight across the Run, and the timer (inside it, so waiting is not
  // counted) says how long the model was busy.
  const analysisConcurrency = options.analysisConcurrency ?? 8;
  const modelCalls = createLimiter(analysisConcurrency);
  const modelTimer = overlapTimer();

  // Retrieval's queue, which draws on the waiting room: Archives held in
  // memory, waiting for or under Analysis. A place is taken before the gate is
  // asked for a download turn (ADR-0020).
  const queue = createRetrievalQueue({
    room: createLimiter(analysisConcurrency),
    onChange: () => live.report(),
  });
  const live = createLiveView({
    onProgress: options.onProgress,
    queueRemaining: () => queue.remaining,
  });
  // A stop wakes Retrieval, which may be waiting, so it sees it.
  const control = createRunControl({
    gate,
    logger,
    stopRequested: options.stopRequested,
    shouldContinue: options.shouldContinue,
    onStop: () => queue.wake(),
  });
  // What a Retrieval turn uses: the site's endpoints, the model's reading
  // inside the Run's limit, and the queue for a refresh that needs a place.
  const retrievalDeps: RetrievalDeps = {
    announcements: deps.announcements,
    resolveZipId: (projectId, signal) => deps.resolveZipId(projectId, signal),
    downloadArchive: (zipId, signal) => deps.downloadArchive(zipId, signal),
    analysis: {
      extractTorPdfs: (archive) => deps.extractTorPdfs(archive),
      classifyDocument: (pdf) =>
        modelCalls.run(() => modelTimer.time(() => deps.classifyDocument(pdf))),
      readInvitation: (archive, projectId) =>
        modelCalls.run(() => modelTimer.time(() => deps.readInvitation(archive, projectId))),
    },
    queue,
  };

  const ledger = createRunLedger({ repository, logger, halt: control.halt });
  /** Errors that are not a record's failure (the store itself failing); the Run stops and rethrows the first. */
  const thrown: unknown[] = [];
  const stopForError = (error: unknown) => {
    thrown.push(error);
    control.halt('error');
  };
  const analyses = createAnalysisTasks({
    deadlineMs: deps.recordDeadlineMs,
    slot: () => live.lowestFreeSlot(),
    fail: ledger.fail,
    onError: stopForError,
  });
  const retrieval = createRetrievalWorker({
    repository,
    gate,
    control,
    queue,
    live,
    ledger,
    analyses,
    turn: retrievalDeps,
    deadlineMs: deps.recordDeadlineMs,
  });

  // Discovery first, so its first request is at the gate before Retrieval's.
  // A one-project Run makes no sweep (ADR-0020).
  if (options.onlyProject) queue.endDiscovery();
  const discovering = (
    options.onlyProject
      ? Promise.resolve(null)
      : runDiscovery({
          repository,
          logger,
          discoverProjects: deps.discoverProjects,
          gate,
          control,
          live,
          queue,
          failures: ledger.failures,
        })
  )
    .catch((error: unknown) => {
      stopForError(error);
      return null;
    })
    .finally(() => {
      live.remove(DISCOVERY_SLOT);
      queue.endDiscovery();
    });

  try {
    if (options.onlyProject) {
      const one = await selectOne(repository, options.onlyProject);
      if (one.length === 0) {
        // Asked for one project and there is none to read: say so, or the
        // administrator who asked is left to wonder why nothing happened.
        await ledger.note(
          { projectId: options.onlyProject, projectName: '-' },
          'discovery',
          'The project was not read: it is not in the queue, or has no attempts left.',
        );
      }
      for (const record of one) queue.enqueue({ record, fresh: true });
    } else {
      for (const record of await selectForRetrieval(repository))
        queue.enqueue({ record, fresh: true });
      for (const record of await selectForRefresh(repository))
        queue.enqueue({ record, fresh: false });
    }
    queue.built();
    live.report();
    await retrieval.run();
  } catch (error) {
    stopForError(error);
  }
  const sweep = await discovering;
  // Archives already fetched are analysed and stored, whatever stopped the Run.
  await analyses.settled();
  live.report();
  if (thrown.length > 0) throw thrown[0];

  const ending = runEnding(control.status, sweep?.result ?? null);
  // Logged only, never stored: a baseline to compare Runs by hand.
  const timing = {
    wallMs: Date.now() - startedAt,
    gate: gate.stats(),
    analysisBusyMs: modelTimer.ms,
    requests: { ...(sweep?.result.requests ?? { newDays: 0, historyDays: 0 }), ...retrieval.turns },
  };
  logger.info(
    { attempted: ledger.attempted, ...ledger.tally, aborted: ending.aborted, timing },
    'egp: run complete',
  );

  return {
    discovered: sweep?.result.records.length ?? 0,
    newRecords: sweep?.sync.created ?? 0,
    changedRecords: sweep?.sync.changed ?? 0,
    unchangedRecords: sweep?.sync.unchanged ?? 0,
    discoveryStopped: ending.discoveryStopped,
    attempted: ledger.attempted,
    ...ledger.tally,
    aborted: ending.aborted,
    stopped: ending.stopped,
    failures: ledger.failures,
    ranAt: sweep?.result.ranAt ?? new Date().toISOString(),
  };
}
