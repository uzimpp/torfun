import type { FastifyBaseLogger } from 'fastify';
import type {
  ArchiveDocument,
  InFlightWork,
  IngestionFailure,
  Procurement,
  RunProgress,
  SoftwareJudgement,
  TorAnalysis,
} from '@torfun/types';
import type { Env } from '../../config/env';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import {
  classifyTorDocument,
  type DocumentClassification,
  type ReadMode,
} from '../vertex/classify-document';
import { readInvitationPdf } from '../vertex/invitation-reader';
import { createOversizeReaders } from '../vertex/oversize-readers';
import { createModelCall, type ModelUsage } from '../vertex/vertex-ai';
import type { AnnouncementClient } from './announcement-client';
import { createAnnouncementClient } from './announcement-client';
import { politeTorDelayMs, RateLimitedError, sleep, UnreachableError } from './client';
import { createLimiter } from './concurrency';
import {
  MAX_ATTEMPTS,
  RECORD_DEADLINE_MS,
  SITE_UNREACHABLE_AFTER,
  STALE_PROCESSING_MS,
} from './constants';
import {
  bangkokToday,
  discoverProjects,
  type DiscoveryResult,
  type SweepBatch,
  type SweepContext,
} from './discovery';
import { assignDocumentRoles, type ClassifiedDocument } from './document-roles';
import { readInvitationDocuments, type InvitationResult } from './invitation';
import {
  downloadArchive,
  extractInvitationPdfs,
  extractTorPdfs,
  resolveZipId,
  type ExtractionResult,
} from './tor-package';
import { createSiteGate, SiteClosedError, SiteLatchedError, type SiteGateHold } from './site-gate';
import { decideOutcome } from './decision';
import { buildTombstone } from './tombstone';
import { decideDeadline } from './deadline';
import { reviewTimeline, type TimelinePatch, type TimelineReview } from './timeline';
import { readProjectDetail } from './project-detail';

/**
 * Orchestrates the ingestion stages — Discovery, Retrieval, Analysis — against
 * the repository.
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
  /** One of this record's requests went unanswered once the site was known to be down. */
  siteDown: boolean;
}

/** One record's work in progress, shared by the steps that make it up. */
interface RecordWork {
  record: Procurement;
  /** Where the record has got to, so a failure is logged against the step that failed. */
  stage: IngestionFailure['stage'];
  guard: RecordGuard;
  /** Marks the span of a call to the upstream site, so a deadline knows to cancel and wait for it. */
  site: <T>(call: () => Promise<T>) => Promise<T>;
  /**
   * Frees the gate once the site is done with. Not awaited: the pause runs
   * inside the gate, so the next request still waits for it, while this
   * record's Analysis can begin at once.
   */
  endSiteSection: () => void;
  /**
   * The record's writes to the store. Each is refused once the deadline has
   * failed the record, so a step still running late cannot overwrite that.
   */
  store: Pick<ProcurementStore, 'amend' | 'transition' | 'tombstone'>;
  /** Log a failure against this record; refused, like `store`, once it is failed by its deadline. */
  note: (
    stage: IngestionFailure['stage'],
    error: string,
    kind?: IngestionFailure['kind'],
  ) => Promise<void>;
  /** Count an outcome for this record; refused, like `store`, once it is failed by its deadline. */
  count: (outcome: keyof Tally) => void;
  /** Gives back the record's place in the waiting room, where it holds one. */
  leaveRoom: (() => void) | undefined;
  /** Shows the record under another line of the live view (its Analysis, after its turn). */
  moveTo: (slot: number) => void;
  /** Takes the record out of the live view. */
  done: () => void;
}

/**
 * What is left of a record once its turn at the site is over: reading the
 * Archive it fetched and storing the outcome. It never touches the site.
 */
type Handoff = () => Promise<void>;

/** What a Run's records came to, as counted in its result. */
interface Tally {
  refreshed: number;
  archivesRetrieved: number;
  torAnalysed: number;
  held: number;
  dropped: number;
  failed: number;
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
   * itself (`stopped` says why). `budget` is no longer produced; runs logged
   * when discovery read the open-data API may carry it.
   */
  discoveryStopped: 'rate_limited' | 'unreachable' | 'budget' | null;
  rejectedNonRegistry: number;
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
 * One unit of a Run's work. A fresh record is retrieved and read; a refresh is a
 * record already read, whose timeline is looked at again and which is worked on
 * further only if the invitation has moved.
 */
interface Candidate {
  record: Procurement;
  fresh: boolean;
  /**
   * A refresh put back because its invitation moved while the waiting room was
   * full: it takes a place before its next turn, as a fresh record does.
   */
  withPlace?: boolean;
}

interface AnalysedArchive {
  documents: ArchiveDocument[];
  analysis: TorAnalysis | null;
  /** What the model concluded about the main TOR's work; null exactly when `analysis` is. */
  judgement: SoftwareJudgement | null;
  /** How the main TOR was read; only a whole-PDF reading may act on its own. */
  readMode: ReadMode | undefined;
  torAmbiguous: boolean;
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

  // All at once: the Run's limiter, inside `classifyDocument`, bounds the calls
  // across every archive. Gemini is not the upstream site, so the politeness
  // terms do not apply. Results come back in archive order, which
  // `assignDocumentRoles` relies on.
  const candidates = await Promise.all(
    extraction.torFiles.map(async (pdf): Promise<ClassifiedDocument> => {
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
    }),
  );

  const { documents, mainTor, ambiguous } = assignDocumentRoles(candidates);

  return {
    documents,
    analysis: mainTor ? (byMember.get(mainTor.member)?.analysis ?? null) : null,
    judgement: mainTor ? (byMember.get(mainTor.member)?.judgement ?? null) : null,
    readMode: mainTor ? byMember.get(mainTor.member)?.readMode : undefined,
    torAmbiguous: ambiguous,
    anyUnreadable: candidates.some((candidate) => candidate.unreadable !== undefined),
  };
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

/** Where each kind of work shows in the live view: Discovery, the Retrieval turn, then Analysis. */
const DISCOVERY_SLOT = 0;
const RETRIEVAL_SLOT = 1;

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
  const classifyDocument: IngestionDeps['classifyDocument'] = (pdf) =>
    modelCalls.run(() => modelTimer.time(() => deps.classifyDocument(pdf)));
  const readInvitation: IngestionDeps['readInvitation'] = (archive, projectId) =>
    modelCalls.run(() => modelTimer.time(() => deps.readInvitation(archive, projectId)));
  // The waiting room: Archives held in memory, waiting for or under Analysis.
  // A place is taken before the gate is asked for a download turn (ADR-0020).
  const room = createLimiter(analysisConcurrency);
  const turns = { retrievalTurns: 0, refreshTurns: 0 };

  const tally: Tally = {
    refreshed: 0,
    archivesRetrieved: 0,
    torAnalysed: 0,
    held: 0,
    dropped: 0,
    failed: 0,
  };
  let attempted = 0;
  let aborted = false;
  const failures: IngestionFailure[] = [];
  /** Errors that are not a record's failure (the store itself failing); the Run stops and rethrows the first. */
  const thrown: unknown[] = [];

  // Retrieval's queue: never-read projects first, then refreshes. A project is
  // queued once per Run, however many ways it is found.
  const freshQueue: Candidate[] = [];
  const refreshQueue: Candidate[] = [];
  const queued = new Set<string>();
  let queueBuilt = false;
  const queueLength = () => freshQueue.length + refreshQueue.length;
  let discoveryDone = false;
  /**
   * Wakes Retrieval when it is waiting: for new work, for Discovery to finish,
   * for a place in the waiting room, or for a stop.
   */
  let wake: (() => void) | null = null;
  const wakeRetrieval = () => {
    const waiting = wake;
    wake = null;
    waiting?.();
  };

  const inFlight = new Map<number, InFlightWork>();
  const report = () =>
    options.onProgress?.({
      inFlight: [...inFlight.values()].sort((a, b) => a.slot - b.slot),
      queueRemaining: queueBuilt ? queueLength() : null,
    });

  const enqueue = (candidate: Candidate) => {
    if (queued.has(candidate.record.projectId)) return;
    queued.add(candidate.record.projectId);
    (candidate.fresh ? freshQueue : refreshQueue).push(candidate);
    report();
    wakeRetrieval();
  };

  /**
   * Why the Run is stopping, once it is. A refusal latches the gate; every other
   * reason closes it, so no further request is made and nothing new is started,
   * without the stop reading as the site saying no.
   */
  let stopping: 'refused' | 'unreachable' | 'admin' | 'lease' | 'error' | null = null;
  let stoppedBy: 'admin' | null = null;
  const halt = (reason: NonNullable<typeof stopping>) => {
    if (reason === 'refused') {
      // Even after a stop for another reason: a request already in flight then
      // may still be refused, and that is still the site saying stop.
      gate.latch();
      aborted = true;
    }
    if (stopping) return;
    stopping = reason;
    if (reason !== 'refused') gate.close(reason === 'unreachable' ? 'unreachable' : 'stopped');
    if (reason === 'admin') stoppedBy = 'admin';
    wakeRetrieval();
  };
  /**
   * Notice a stop asked for since the last look (an administrator's, or a lost
   * lease) and stop the Run for it, which closes the gate.
   */
  const noticeStop = (): void => {
    if (stopping) return;
    if (options.stopRequested?.()) {
      logger.info('egp: run stopped by an administrator; the rest stay Queued');
      halt('admin');
    } else if (options.shouldContinue && !options.shouldContinue()) {
      logger.warn('egp: run stopped before its next request; the rest stay Queued');
      halt('lease');
    }
  };
  /** Asked before each record; false once the Run is stopping. */
  const mayGoOn = (): boolean => {
    noticeStop();
    return stopping === null;
  };

  /**
   * Requests in a row, across the whole Run, that got no answer at all. Every
   * request to the site passes through `askSite`, Discovery's and Retrieval's
   * alike, so a dead site is noticed however the two interleave.
   */
  let silent = 0;
  /** The site stopped answering and the Run is stopping for it. */
  let siteDown = false;
  let discoveryStopped: RunResult['discoveryStopped'] = null;
  const askSite = async <T>(call: () => Promise<T>, record?: RecordGuard): Promise<T> => {
    try {
      const answer = await call();
      silent = 0;
      return answer;
    } catch (error) {
      // Any answer, an error page included, shows the site is there. A request
      // the record's deadline cancelled got none in its time: the site hung.
      // Nothing else cancels a request, so a stop is never counted here.
      const unanswered = error instanceof UnreachableError || record?.expired === true;
      silent = unanswered ? silent + 1 : 0;
      if (silent >= SITE_UNREACHABLE_AFTER && !siteDown) {
        siteDown = true;
        // Shown as the site not answering; Discovery, if it is running, learns
        // of it from the closed gate.
        discoveryStopped = 'unreachable';
        logger.warn({ silent }, 'egp: the site stopped answering; the Run stops here');
        halt('unreachable');
      }
      if (unanswered && siteDown && record) record.siteDown = true;
      throw error;
    }
  };

  const note = async (
    about: Pick<Procurement, 'projectId' | 'projectName'>,
    stage: IngestionFailure['stage'],
    error: string,
    kind: IngestionFailure['kind'] = 'fault',
  ) => {
    const failure = {
      projectId: about.projectId,
      projectName: about.projectName,
      stage,
      kind,
      error,
      at: new Date().toISOString(),
    };
    failures.push(failure);
    await repository.recordFailures([failure]);
  };

  // ---- Discovery ----

  let discovery: DiscoveryResult | null = null;
  let sync = { created: 0, changed: 0, unchanged: 0 };

  const runDiscovery = async (): Promise<void> => {
    logger.info('egp: starting discovery sweep');
    // One line in the live view while it runs; it has no project of its own.
    const reading = (what: string) => {
      inFlight.set(DISCOVERY_SLOT, {
        slot: DISCOVERY_SLOT,
        projectId: '-',
        projectName: what,
        stage: 'discovery',
        fresh: true,
        since: new Date().toISOString(),
      });
      report();
    };
    reading('-');

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
        if (record) enqueue({ record, fresh: true });
      }
    };

    const result = await deps.discoverProjects({
      site: async (tier, call) => {
        // A stop asked for since the last request closes the gate, which then
        // turns this one away.
        noticeStop();
        const hold = await gate.acquire(tier);
        try {
          return await askSite(call);
        } catch (error) {
          // The site said stop: nothing else this Run may ask it anything.
          if (error instanceof RateLimitedError) halt('refused');
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
    discovery = result;

    if (result.rateLimited) {
      // Cut short by a refusal, its own or Retrieval's. What it found is kept,
      // but it is not a finished sweep.
      discoveryStopped = 'rate_limited';
      logger.warn('egp: the site refused; discovery stopped there');
      halt('refused');
    } else if (result.unreachable) {
      // Normally already stopped, and logged, where the silence was counted
      // (`askSite`); stopping again changes nothing.
      discoveryStopped = 'unreachable';
      halt('unreachable');
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
  };

  // ---- Retrieval: one gate turn per project ----

  /**
   * The project's timeline, with any code not seen before logged. Null where
   * there is nothing to go on: e-GP gave none, or the record's time ran out
   * (the caller tells the two apart by `guard.expired`).
   */
  const readTimeline = async (work: RecordWork): Promise<TimelineReview | null> => {
    const { record, guard } = work;
    const rows = await work.site(() =>
      deps.announcements.timeline(record.projectId, guard.controller.signal),
    );
    if (guard.expired) return null;
    if (rows === null) {
      // "Unavailable" is not "no announcements": the project keeps what it had.
      await work.note(
        'timeline',
        'e-GP gave no announcement timeline for this project (data: null).',
      );
      return null;
    }
    const review = reviewTimeline(record, rows, new Date().toISOString());
    for (const unknown of review.unrecognised) {
      await work.note(
        'timeline',
        `Unrecognised announcement code "${unknown.announceType}" (${unknown.announceDate ?? 'no date'}); the status was not changed by it.`,
      );
    }
    return review;
  };

  /**
   * Discovery stores a project from the feed alone, so a record whose detail
   * was never read (`detailCheckedAt` null) gets it first, in the same gate hold
   * as its timeline (ADR-0020). A failure is logged and the record carries on
   * with the year it has, null for a new one, never guessed; the next Run asks
   * again. A refusal is thrown on and stops the Run as usual.
   */
  const catchUpDetail = async (work: RecordWork): Promise<void> => {
    const { record, guard } = work;
    if (record.detailCheckedAt !== null) return;
    const read = await work.site(() =>
      readProjectDetail(deps.announcements, record.projectId, guard.controller.signal),
    );
    if (guard.expired) return;
    if ('error' in read) return work.note('timeline', read.error);
    // Only a change an officer can see counts as news.
    const visible =
      read.fields.budgetYear !== record.budgetYear ||
      read.fields.deptSubName !== record.deptSubName;
    await work.store.amend(record.projectId, read.fields, visible);
    // Later steps read this record (a tombstone keeps its year), so it must be current.
    work.record = { ...record, ...read.fields };
  };

  /** A project already read: its timeline again, and the invitation only if that moved. */
  const refresh = async (work: RecordWork): Promise<Handoff | undefined> => {
    const { record } = work;
    const review = await readTimeline(work);
    if (work.guard.expired) return;
    if (review === null) {
      work.endSiteSection();
      return;
    }

    if (!review.invitationMoved) {
      work.count('refreshed');
      // A read that found nothing new is not news: only its time is kept.
      const patch = review.changed
        ? review.patch
        : { timelineCheckedAt: review.patch.timelineCheckedAt };
      await work.store.amend(record.projectId, patch, review.changed);
      work.endSiteSection();
      return;
    }

    // The invitation moved, so the archive is fetched, and an Archive needs a
    // place in the waiting room. This turn holds the gate, so it never waits for
    // one: the room could be full of records waiting for this very gate. It
    // takes a place only if one is free now. If none is, the project goes to the
    // back of the queue to take a place before its next turn, and is left
    // untouched meanwhile, so a Run that ends first leaves it due for the next.
    if (!work.leaveRoom) {
      const place = takePlace();
      if (!place) {
        // Queued before the gate is freed, so the pause after this turn is kept.
        refreshQueue.push({ record, fresh: false, withPlace: true });
        report();
        work.endSiteSection();
        return;
      }
      work.leaveRoom = place;
    }
    work.count('refreshed');
    // The moved date is kept back until the invitation it dates has been re-read,
    // or a failed re-read would leave it looking already done.
    await work.store.amend(
      record.projectId,
      { timelineCheckedAt: review.patch.timelineCheckedAt },
      false,
    );
    return rereadInvitation(work, review.patch);
  };

  /** A read project whose invitation moved: fetch the archive and read only the invitation. */
  const rereadInvitation = async (
    work: RecordWork,
    timeline: TimelinePatch,
  ): Promise<Handoff | undefined> => {
    const { record, guard } = work;
    work.stage = 'info';
    const zipId = await work.site(() =>
      deps.resolveZipId(record.projectId, guard.controller.signal),
    );
    if (guard.expired) return;
    if (zipId === null) {
      work.endSiteSection();
      await work.note(
        'info',
        'No zipId in the announcement response — the re-dated invitation was not re-read.',
      );
      return;
    }
    work.stage = 'download';
    const archive = await work.site(() => deps.downloadArchive(zipId, guard.controller.signal));
    if (guard.expired) return;
    work.endSiteSection();

    return async () => {
      work.stage = 'analysis';
      const invitation = await readInvitation(archive, record.projectId);
      if (guard.expired) return;
      const reread = new Set(invitation.documents.map((document) => document.member));
      await work.store.amend(
        record.projectId,
        {
          ...timeline,
          documents: [
            ...record.documents.filter(
              (document) =>
                document.role !== 'invitation' &&
                document.role !== 'bidding_document' &&
                !reread.has(document.member),
            ),
            ...invitation.documents,
          ],
          ...decideDeadline(record, {
            priced: timeline.milestones.priced?.at ?? null,
            invitationBidAt: invitation.bidAt,
            torDeadline: record.analysis?.deadlineAt ?? null,
          }),
        },
        true,
      );
    };
  };

  /** A project never read: its timeline, then its archive retrieved, to be read by Analysis. */
  const retrieve = async (work: RecordWork): Promise<Handoff | undefined> => {
    const { record, guard } = work;
    const review = await readTimeline(work);
    if (guard.expired) return;
    let current = record;
    if (review !== null) {
      await work.store.amend(record.projectId, review.patch, true);
      current = { ...record, ...review.patch };
    }

    work.stage = 'info';
    const zipId = await work.site(() =>
      deps.resolveZipId(record.projectId, guard.controller.signal),
    );
    if (guard.expired) return;

    if (zipId === null) {
      // A real answer from upstream, not a transport error: this project
      // published no TOR package. Recorded as Failed because an admin is
      // left with nothing to read, but distinguished by its outcome.
      const error = 'No zipId in the announcement response — no TOR package published.';
      work.endSiteSection();
      await work.note('info', error, 'no_tor');
      await work.store.transition(record.projectId, 'no_tor_package', {}, error);
      work.count('failed');
      return;
    }
    return readArchive(work, current, zipId);
  };

  /** The download, the last of the turn; what follows is the Analysis handed back. */
  const readArchive = async (
    work: RecordWork,
    current: Procurement,
    zipId: string,
  ): Promise<Handoff | undefined> => {
    const { record, guard } = work;
    work.stage = 'download';
    const archive = await work.site(() => deps.downloadArchive(zipId, guard.controller.signal));
    if (guard.expired) return;
    work.endSiteSection();

    return async () => {
      work.stage = 'extract';
      const extraction = deps.extractTorPdfs(archive);
      work.count('archivesRetrieved');

      if (extraction.unsafeSkipped.length > 0) {
        // Never silently dropped: a path-traversal attempt in a government
        // archive is exactly the thing an administrator should see.
        await work.note(
          'extract',
          `Archive members rejected by the path-traversal guard: ${extraction.unsafeSkipped.join(', ')}`,
        );
      }

      // The record only counts as being read once there is something to read.
      if (extraction.torFiles.length > 0) {
        await work.store.transition(record.projectId, 'analysing');
      }

      work.stage = 'analysis';
      const analysed = await analyseArchive(extraction, classifyDocument);
      if (guard.expired) return;

      // Note what is NOT here: extraction.torFiles carries the PDF payloads,
      // and they stop at this line. Only the manifest is persisted (ADR-0002).
      const patch: Partial<Procurement> = {
        zipId,
        documents: analysed.documents,
        analysis: analysed.analysis,
        torAmbiguous: analysed.torAmbiguous,
      };

      // The TOR was read either way. What the model's judgement may do is
      // decided in one place: only a confident, whole-document answer
      // shows or drops a record, and anything else is held for a person.
      const decision =
        analysed.analysis !== null && analysed.judgement !== null
          ? decideOutcome({ ...analysed.judgement, partialRead: analysed.readMode !== 'pdf' })
          : null;

      if (decision?.result !== 'drop') {
        // A dropped record keeps nothing, so its invitation is not worth a call.
        // Read even with no TOR: an administrator still sees the deadline.
        const invitation = await readInvitation(archive, record.projectId);
        if (guard.expired) return;
        patch.documents = [...analysed.documents, ...invitation.documents];
        Object.assign(
          patch,
          decideDeadline(current, {
            priced: current.milestones.priced?.at ?? null,
            invitationBidAt: invitation.bidAt,
            torDeadline: analysed.analysis?.deadlineAt ?? null,
          }),
        );
      }

      if (analysed.analysis !== null && analysed.judgement !== null && decision) {
        if (decision.result === 'drop') {
          // Dropped: nothing read from the document is kept, only the
          // decision and the quote that made it.
          await work.store.tombstone(
            buildTombstone({
              projectId: record.projectId,
              reason: 'ai_not_software',
              evidence: analysed.judgement.reason,
              promptVersion: analysed.analysis.promptVersion,
              decidedBy: null,
              now: new Date(),
              record,
            }),
          );
          work.count('dropped');
        } else {
          await work.store.transition(
            record.projectId,
            decision.outcome,
            decision.result === 'held' ? { ...patch, holdReason: decision.holdReason } : patch,
          );
          if (decision.result === 'held') work.count('held');
          else work.count('torAnalysed');
        }
      } else if (analysed.anyUnreadable) {
        // The archive was retrieved; only the reading failed. Kept Completed
        // so a retry re-reads what is already here instead of re-downloading
        // from a site that asked not to be crawled.
        await work.note(
          'analysis',
          `Archive retrieved but no candidate could be read: ${analysed.documents
            .filter((document) => document.role === 'unreadable')
            .map((document) => `${document.filename} (${document.note})`)
            .join('; ')}`,
        );
        await work.store.transition(record.projectId, 'analysis_failed', patch);
      } else {
        await work.note(
          'extract',
          `Archive downloaded (${extraction.members.length} members) but none of its documents is a TOR.`,
          'no_tor',
        );
        await work.store.transition(record.projectId, 'no_tor_in_archive', patch);
      }
    };
  };

  /** Records why a record's work stopped; a refusal from the site stops the Run. */
  const fail = async (work: RecordWork, fresh: boolean, error: unknown): Promise<void> => {
    const { record } = work;
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof SiteLatchedError || error instanceof SiteClosedError) {
      // Turned away at the gate: the Run is stopping. This record never reached
      // the site, so it has nothing to log and nothing to count: it goes back, whole.
      if (fresh) {
        await repository.transition(record.projectId, 'queued', {});
        attempted -= 1;
      }
      return;
    }

    /**
     * The site's fault, not the record's: logged, and a fresh record goes back
     * to the queue without spending one of its attempts. A record only being
     * refreshed was never taken off its Outcome.
     */
    const putBack = async () => {
      if (fresh) await repository.transition(record.projectId, 'queued', {}, message);
      await note(record, work.stage, message);
      tally.failed += 1;
    };

    if (work.guard.siteDown) {
      // The request that showed the site is down, or one in flight after it.
      return putBack();
    }

    if (error instanceof RateLimitedError) {
      halt('refused');
      // The site is telling us to stop. Stop — leaving the rest Queued for a
      // later run rather than pushing through.
      await putBack();
      logger.warn({ projectId: record.projectId }, 'egp: rate limited, aborting run');
      return;
    }

    await note(record, work.stage, message);
    if (fresh) {
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
    }
    tally.failed += 1;
  };

  // ---- Analysis: one task per fetched Archive ----

  const analyses = new Set<Promise<void>>();

  /**
   * Read a fetched Archive and store the outcome, as a task of its own, so
   * Retrieval does not wait for it.
   *
   * It has a deadline of its own, as long as a turn's: the model is not the
   * site, but a call that never answers must not hold the Run open for ever.
   * When that deadline wins, the record is failed as any late record is, while
   * its place in the waiting room is kept until the model's calls have really
   * settled: the Archive is still in memory until then.
   */
  const analyse = (work: RecordWork, fresh: boolean, handoff: Handoff) => {
    const task = (async () => {
      work.moveTo(lowestFreeSlot());
      const running = handoff();
      const leave = () => work.leaveRoom?.();
      void running.then(leave, leave);
      try {
        await withDeadline(() => running, deps.recordDeadlineMs, work.guard);
      } catch (error) {
        await fail(work, fresh, error);
      } finally {
        work.done();
      }
    })().catch((error: unknown) => {
      thrown.push(error);
      halt('error');
    });
    analyses.add(task);
    void task.finally(() => analyses.delete(task));
  };

  const lowestFreeSlot = () => {
    let slot = RETRIEVAL_SLOT + 1;
    while (inFlight.has(slot)) slot += 1;
    return slot;
  };

  /**
   * A place in the waiting room if one is free now, never waited for. Giving it
   * back wakes Retrieval, which may be waiting for one.
   */
  const takePlace = (): (() => void) | null => {
    const release = room.tryAcquire();
    if (!release) return null;
    return () => {
      release();
      wakeRetrieval();
    };
  };

  /** Whether anything after this request may still ask the site; if not, its pause can go. */
  const moreToAsk = () => !discoveryDone || queueLength() > 0 || gate.pending > 0;

  /** One project's turn at the site, then its Archive handed to Analysis. Throws only if the store does. */
  const take = async (candidate: Candidate, leaveRoom?: () => void): Promise<void> => {
    const { record, fresh } = candidate;
    if (fresh) {
      attempted += 1;
      await repository.transition(record.projectId, 'downloading');
    }

    let hold: SiteGateHold | undefined;
    const guard: RecordGuard = {
      expired: false,
      siteRequest: false,
      controller: new AbortController(),
      siteDown: false,
    };
    const live = () => !guard.expired;
    let slot = RETRIEVAL_SLOT;
    let stage: IngestionFailure['stage'] = 'timeline';
    const enter = () => {
      inFlight.set(slot, {
        slot,
        projectId: record.projectId,
        projectName: record.projectName,
        stage,
        fresh,
        since: new Date().toISOString(),
      });
      report();
    };
    enter();
    const work: RecordWork = {
      record,
      get stage() {
        return stage;
      },
      set stage(next) {
        stage = next;
        enter();
      },
      guard,
      site: async (call) => {
        guard.siteRequest = true;
        try {
          return await askSite(call, guard);
        } finally {
          guard.siteRequest = false;
        }
      },
      // A pause follows only where another site request may come.
      endSiteSection: () => {
        void hold?.release({ pauseAfter: moreToAsk() });
      },
      store: {
        amend: async (...args) => (live() ? repository.amend(...args) : undefined),
        transition: async (...args) => (live() ? repository.transition(...args) : undefined),
        tombstone: async (tombstone) => {
          if (live()) await repository.tombstone(tombstone);
        },
      },
      note: async (stage, error, kind) => {
        if (live()) await note(work.record, stage, error, kind);
      },
      count(outcome) {
        if (live()) tally[outcome] += 1;
      },
      leaveRoom,
      moveTo(next) {
        inFlight.delete(slot);
        slot = next;
        enter();
      },
      done() {
        inFlight.delete(slot);
        report();
      },
    };

    let handoff: Handoff | undefined;
    let failedTurn = false;
    try {
      // Waiting for the gate is not the record's time: its deadline starts once
      // it has the site to itself, and covers the turn only.
      hold = await gate.acquire(fresh ? 'fresh' : 'refresh');
      turns[fresh ? 'retrievalTurns' : 'refreshTurns'] += 1;
      await withDeadline(
        async () => {
          await catchUpDetail(work);
          if (guard.expired) return;
          handoff = await (fresh ? retrieve(work) : refresh(work));
        },
        deps.recordDeadlineMs,
        guard,
      );
    } catch (error) {
      failedTurn = true;
      await fail(work, fresh, error);
    } finally {
      // Whatever ended the turn, the gate is not left held.
      await hold?.release();
    }

    if (failedTurn || !handoff) {
      work.leaveRoom?.();
      work.done();
      return;
    }
    analyse(work, fresh, handoff);
  };

  /**
   * The next project to take, with the waiting-room place it needs, if any.
   *
   * Never-read projects go first, but each needs a place before its turn. When
   * the room is full the gate goes on serving refreshes, which take no place up
   * front (ADR-0020), so a full room does not hold them up behind fresh work.
   * Null when nothing can be taken now: the queue is empty, or everything in it
   * needs a place and none is free.
   */
  const pick = (): { candidate: Candidate; place?: () => void } | null => {
    const needsPlace = freshQueue.length > 0 || refreshQueue.some((each) => each.withPlace);
    const place = needsPlace ? takePlace() : null;
    if (place && freshQueue.length > 0) return { candidate: freshQueue.shift()!, place };
    const index = refreshQueue.findIndex((each) => !each.withPlace || place);
    if (index < 0) return null;
    const [candidate] = refreshQueue.splice(index, 1) as [Candidate];
    if (candidate.withPlace) return { candidate, place: place! };
    place?.();
    return { candidate };
  };

  const retrieval = async (): Promise<void> => {
    for (;;) {
      // Nothing is taken from the queue once stopping: what is left stays
      // Queued, no attempt spent.
      if (!mayGoOn()) return;
      const next = pick();
      if (!next) {
        if (queueLength() === 0 && discoveryDone) return;
        // Wait for new work, Discovery's end, a place, or a stop. Each of them
        // wakes this, and none can happen between `pick` and here.
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      report();
      await take(next.candidate, next.place);
    }
  };

  // ---- The Run ----

  // Discovery first, so its first request is at the gate before Retrieval's.
  // A one-project Run makes no sweep (ADR-0020).
  if (options.onlyProject) discoveryDone = true;
  const discovering = (options.onlyProject ? Promise.resolve() : runDiscovery())
    .catch((error: unknown) => {
      thrown.push(error);
      halt('error');
    })
    .finally(() => {
      discoveryDone = true;
      inFlight.delete(DISCOVERY_SLOT);
      report();
      wakeRetrieval();
    });

  try {
    if (options.onlyProject) {
      const one = await selectOne(repository, options.onlyProject);
      if (one.length === 0) {
        // Asked for one project and there is none to read: say so, or the
        // administrator who asked is left to wonder why nothing happened.
        await note(
          { projectId: options.onlyProject, projectName: '-' },
          'discovery',
          'The project was not read: it is not in the queue, or has no attempts left.',
        );
      }
      for (const record of one) enqueue({ record, fresh: true });
    } else {
      for (const record of await selectForRetrieval(repository)) enqueue({ record, fresh: true });
      for (const record of await selectForRefresh(repository)) enqueue({ record, fresh: false });
    }
    queueBuilt = true;
    report();
    await retrieval();
  } catch (error) {
    thrown.push(error);
    halt('error');
  }
  await discovering;
  // Archives already fetched are analysed and stored, whatever stopped the Run.
  while (analyses.size > 0) await Promise.all([...analyses]);
  report();
  if (thrown.length > 0) throw thrown[0];

  // Logged only, never stored: a baseline to compare Runs by hand.
  const swept = (discovery as DiscoveryResult | null)?.requests ?? { newDays: 0, historyDays: 0 };
  const timing = {
    wallMs: Date.now() - startedAt,
    gate: gate.stats(),
    analysisBusyMs: modelTimer.ms,
    requests: { ...swept, ...turns },
  };
  logger.info({ attempted, ...tally, aborted, timing }, 'egp: run complete');

  return {
    discovered: (discovery as DiscoveryResult | null)?.records.length ?? 0,
    newRecords: sync.created,
    changedRecords: sync.changed,
    unchangedRecords: sync.unchanged,
    discoveryStopped,
    // The feed is asked per agency, so nothing arrives from outside the registry.
    rejectedNonRegistry: 0,
    attempted,
    ...tally,
    aborted,
    stopped: stoppedBy,
    failures,
    ranAt: (discovery as DiscoveryResult | null)?.ranAt ?? new Date().toISOString(),
  };
}
