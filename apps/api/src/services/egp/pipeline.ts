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
import { politeTorDelayMs, RateLimitedError, sleep } from './client';
import { mapWithConcurrency } from './concurrency';
import {
  ANALYSIS_CONCURRENCY,
  MAX_ATTEMPTS,
  RECORD_DEADLINE_MS,
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
import { createSiteGate, SiteLatchedError, type SiteGateHold } from './site-gate';
import { decideOutcome } from './decision';
import { buildTombstone } from './tombstone';
import { decideDeadline } from './deadline';
import { reviewTimeline, type TimelinePatch, type TimelineReview } from './timeline';
import { readProjectDetail } from './project-detail';

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
  /** Longest one record may take before it is treated as a transport failure. */
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
}

/** One record's work in progress, shared by the steps that make it up. */
interface RecordWork {
  record: Procurement;
  /** Where the record has got to, so a failure is logged against the step that failed. */
  stage: IngestionFailure['stage'];
  guard: RecordGuard;
  /** Marks the span of a call to the upstream site, so a deadline knows to cancel and wait for it. */
  site: <T>(call: () => Promise<T>) => Promise<T>;
  /** Frees the gate once the site is done with. */
  endSiteSection: () => Promise<void>;
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
   * Asked before each record. A Run cannot be cancelled mid-record, so this is
   * where one that no longer holds the right to run — its lease was taken
   * over — stops rather than overlap another Run's requests to the site.
   */
  shouldContinue?: () => boolean;
  /**
   * A discovery sweep younger than this is not repeated: its requests go to the
   * site the downloads need, for little that is new. Unset means always sweep.
   */
  discoveryMaxAgeMs?: number;
  /** Sweep regardless of how recent the last one was. */
  forceDiscovery?: boolean;
  /**
   * Retrieve this project and no other. Discovery still runs as asked (a restore
   * from a tombstone with no feed snapshot needs it to bring the project back);
   * what changes is that the queue is not worked through, so the site is asked
   * about one project. A project not in the queue by then is reported as a
   * failure rather than skipped.
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
  /** This Run made no discovery sweep (the last was recent). */
  discoverySkipped: boolean;
  /**
   * Why a sweep that began did not finish: the site refused it. Null when it
   * finished or never began. `budget` is no longer produced; runs logged when
   * discovery read the open-data API may carry it.
   */
  discoveryStopped: 'rate_limited' | 'budget' | null;
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
  const skipSweep =
    options.discoveryMaxAgeMs !== undefined &&
    !options.forceDiscovery &&
    lastSweep !== null &&
    Date.now() - Date.parse(lastSweep) < options.discoveryMaxAgeMs;

  // One gate for the whole Run: the feed Discovery reads and the archives
  // Retrieval fetches are the same site, so they share its terms (site-gate.ts).
  const gate = createSiteGate({ pause: () => deps.sleep(politeTorDelayMs()) });

  let discovery: DiscoveryResult;
  let sync = { created: 0, changed: 0, unchanged: 0 };
  let discoveryStopped: RunResult['discoveryStopped'] = null;

  if (skipSweep) {
    // The answer has not had time to change. The queue already holds what the
    // last sweep found, so go straight to retrieving from it.
    logger.info({ lastSweep }, 'egp: last discovery sweep is recent, skipping it');
    discovery = {
      records: [],
      notEBidding: 0,
      tombstoned: 0,
      truncated: 0,
      cursor: {},
      failures: [],
      rateLimited: false,
      ranAt: lastSweep ?? new Date().toISOString(),
    };
  } else {
    logger.info('egp: starting discovery sweep');
    let saved = false;
    const save = async (batch: SweepBatch) => {
      saved = true;
      const summary = await repository.upsertMany(batch.records);
      sync = {
        created: sync.created + summary.created,
        changed: sync.changed + summary.changed,
        unchanged: sync.unchanged + summary.unchanged,
      };
      await repository.recordFailures(batch.failures);
      // Covers exactly the days read in full, even if the sweep stops later.
      await repository.recordFeedCursor(batch.cursor);
    };
    discovery = await deps.discoverProjects({
      site: async (call) => {
        const hold = await gate.acquire();
        try {
          return await call();
        } catch (error) {
          // The site said stop: nothing else this Run may ask it anything.
          if (error instanceof RateLimitedError) gate.latch();
          throw error;
        } finally {
          await hold.release();
        }
      },
      cursor: await repository.feedCursor(),
      // A project that has a tombstone is not admitted, whatever the feed says
      // about it: the tombstone is the decision, until an administrator lifts it.
      tombstonedIds: (ids) => repository.tombstonedIds(ids),
      storedRecords: (ids) => repository.getMany(ids),
      today: bangkokToday(),
      save,
    });
    // A sweep that handed nothing to `save` on the way is stored whole here.
    if (!saved) await save(discovery);

    if (discovery.rateLimited) {
      // Cut short by a refusal. What it found is kept, but it is not a finished
      // sweep, so the next Run is not told to skip one.
      discoveryStopped = 'rate_limited';
      logger.warn('egp: the site refused during discovery; the Run stops here');
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
      notEBidding: discovery.notEBidding,
      tombstoned: discovery.tombstoned,
      truncated: discovery.truncated,
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

  // New projects first, so a throttled site cannot starve them behind refresh-only
  // work. None at all once the site has refused: it said stop.
  const candidates: Candidate[] = discovery.rateLimited
    ? []
    : options.onlyProject
      ? (await selectOne(repository, options.onlyProject)).map((record) => ({
          record,
          fresh: true,
        }))
      : [
          ...(await selectForRetrieval(repository)).map((record) => ({ record, fresh: true })),
          ...(await selectForRefresh(repository)).map((record) => ({ record, fresh: false })),
        ];

  let refreshed = 0;
  let archivesRetrieved = 0;
  let torAnalysed = 0;
  let held = 0;
  let dropped = 0;
  let failed = 0;
  let attempted = 0;
  // A refusal during discovery ends the Run before any record is taken.
  let aborted = discovery.rateLimited;

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

  if (options.onlyProject && candidates.length === 0 && !discovery.rateLimited) {
    // Asked for one project and there is none to read: say so, or the
    // administrator who asked is left to wonder why nothing happened. After a
    // refusal the refusal is the reason, and it is already in the log.
    await note(
      { projectId: options.onlyProject, projectName: '-' },
      'discovery',
      'The project was not read: it is not in the queue (no sweep has brought it back, or the sweep stopped early).',
    );
  }

  const queue = [...candidates];
  let stopped = false;
  let stoppedBy: 'admin' | null = null;

  const inFlight = new Map<number, InFlightWork>();
  const report = () =>
    options.onProgress?.({
      inFlight: [...inFlight.values()].sort((a, b) => a.slot - b.slot),
      queueRemaining: queue.length,
    });

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
      await note(
        record,
        'timeline',
        'e-GP gave no announcement timeline for this project (data: null).',
      );
      return null;
    }
    const review = reviewTimeline(record, rows, new Date().toISOString());
    for (const unknown of review.unrecognised) {
      await note(
        record,
        'timeline',
        `Unrecognised announcement code "${unknown.announceType}" (${unknown.announceDate ?? 'no date'}); the status was not changed by it.`,
      );
    }
    return review;
  };

  /**
   * A record stored before the project detail was read gets it now, in the
   * same gate hold as its timeline. If it fails, the old year stays and the
   * next Run asks again; a refusal is thrown on and stops the Run as usual.
   */
  const catchUpDetail = async (work: RecordWork): Promise<void> => {
    const { record, guard } = work;
    if (record.detailCheckedAt !== null) return;
    const read = await work.site(() =>
      readProjectDetail(deps.announcements, record.projectId, guard.controller.signal),
    );
    if (guard.expired) return;
    if ('error' in read) return note(record, 'timeline', read.error);
    // Only a change an officer can see counts as news.
    const visible =
      read.fields.budgetYear !== record.budgetYear ||
      read.fields.deptSubName !== record.deptSubName;
    await repository.amend(record.projectId, read.fields, visible);
    // Later steps read this record (a tombstone keeps its year), so it must be current.
    work.record = { ...record, ...read.fields };
  };

  /** A project already read: its timeline again, and the invitation only if that moved. */
  const refresh = async (work: RecordWork): Promise<void> => {
    const { record } = work;
    const review = await readTimeline(work);
    if (work.guard.expired) return;
    if (review === null) return work.endSiteSection();
    refreshed += 1;

    if (!review.invitationMoved) {
      // A read that found nothing new is not news: only its time is kept.
      const patch = review.changed
        ? review.patch
        : { timelineCheckedAt: review.patch.timelineCheckedAt };
      await repository.amend(record.projectId, patch, review.changed);
      return work.endSiteSection();
    }
    // The moved date is kept back until the invitation it dates has been re-read,
    // or a failed re-read would leave it looking already done.
    await repository.amend(
      record.projectId,
      { timelineCheckedAt: review.patch.timelineCheckedAt },
      false,
    );
    await rereadInvitation(work, review.patch);
  };

  /** A read project whose invitation moved: fetch the archive and read only the invitation. */
  const rereadInvitation = async (work: RecordWork, timeline: TimelinePatch): Promise<void> => {
    const { record, guard } = work;
    work.stage = 'info';
    const zipId = await work.site(() =>
      deps.resolveZipId(record.projectId, guard.controller.signal),
    );
    if (guard.expired) return;
    if (zipId === null) {
      await work.endSiteSection();
      await note(
        record,
        'info',
        'No zipId in the announcement response — the re-dated invitation was not re-read.',
      );
      return;
    }
    work.stage = 'download';
    const archive = await work.site(() => deps.downloadArchive(zipId, guard.controller.signal));
    if (guard.expired) return;
    await work.endSiteSection();

    work.stage = 'analysis';
    const invitation = await deps.readInvitation(archive, record.projectId);
    if (guard.expired) return;
    const reread = new Set(invitation.documents.map((document) => document.member));
    await repository.amend(
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

  /** A project never read: its timeline, then its archive retrieved and read. */
  const retrieve = async (work: RecordWork): Promise<void> => {
    const { record, guard } = work;
    const review = await readTimeline(work);
    if (guard.expired) return;
    let current = record;
    if (review !== null) {
      await repository.amend(record.projectId, review.patch, true);
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
      await work.endSiteSection();
      await note(record, 'info', error, 'no_tor');
      await repository.transition(record.projectId, 'no_tor_package', {}, error);
      failed += 1;
      return;
    }
    await readArchive(work, current, zipId);
  };

  const readArchive = async (work: RecordWork, current: Procurement, zipId: string) => {
    const { record, guard } = work;
    work.stage = 'download';
    const archive = await work.site(() => deps.downloadArchive(zipId, guard.controller.signal));
    if (guard.expired) return;
    await work.endSiteSection();
    work.stage = 'extract';
    const extraction = deps.extractTorPdfs(archive);
    archivesRetrieved += 1;

    if (extraction.unsafeSkipped.length > 0) {
      // Never silently dropped: a path-traversal attempt in a government
      // archive is exactly the thing an administrator should see.
      await note(
        record,
        'extract',
        `Archive members rejected by the path-traversal guard: ${extraction.unsafeSkipped.join(', ')}`,
      );
    }

    // The record only counts as being read once there is something to read.
    if (extraction.torFiles.length > 0) {
      await repository.transition(record.projectId, 'analysing');
    }

    work.stage = 'analysis';
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
      const invitation = await deps.readInvitation(archive, record.projectId);
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
        await repository.tombstone(
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
        dropped += 1;
      } else {
        await repository.transition(
          record.projectId,
          decision.outcome,
          decision.result === 'held' ? { ...patch, holdReason: decision.holdReason } : patch,
        );
        if (decision.result === 'held') held += 1;
        else torAnalysed += 1;
      }
    } else if (analysed.anyUnreadable) {
      // The archive was retrieved; only the reading failed. Kept Completed
      // so a retry re-reads what is already here instead of re-downloading
      // from a site that asked not to be crawled.
      await note(
        record,
        'analysis',
        `Archive retrieved but no candidate could be read: ${analysed.documents
          .filter((document) => document.role === 'unreadable')
          .map((document) => `${document.filename} (${document.note})`)
          .join('; ')}`,
      );
      await repository.transition(record.projectId, 'analysis_failed', patch);
    } else {
      await note(
        record,
        'extract',
        `Archive downloaded (${extraction.members.length} members) but none of its documents is a TOR.`,
        'no_tor',
      );
      await repository.transition(record.projectId, 'no_tor_in_archive', patch);
    }
  };

  /** Records why a record's work stopped; a refusal from the site stops the Run. */
  const fail = async (work: RecordWork, fresh: boolean, error: unknown): Promise<void> => {
    const { record } = work;
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof SiteLatchedError) {
      // Another runner met the refusal. This one never reached the site, so it
      // has nothing to log and nothing to count: the record goes back, whole.
      if (fresh) {
        await repository.transition(record.projectId, 'queued', {});
        attempted -= 1;
      }
      stopped = true;
      return;
    }

    if (error instanceof RateLimitedError) {
      gate.latch();
      // The site is telling us to stop. Stop — leaving the rest Queued for a
      // later run rather than pushing through. This record did nothing wrong,
      // so it goes back to the queue without spending one of its attempts. A
      // record only being refreshed was never taken off its Outcome.
      if (fresh) await repository.transition(record.projectId, 'queued', {}, message);
      await note(record, work.stage, message);
      failed += 1;
      aborted = true;
      stopped = true;
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
    failed += 1;
  };

  /** One record, from its site requests to its stored outcome. Never throws. */
  const processRecord = async ({ record, fresh }: Candidate, slot: number): Promise<void> => {
    if (fresh) {
      attempted += 1;
      await repository.transition(record.projectId, 'downloading');
    }

    let hold: SiteGateHold | undefined;
    const guard: RecordGuard = {
      expired: false,
      siteRequest: false,
      controller: new AbortController(),
    };
    const enter = (stage: IngestionFailure['stage']) => {
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
    let stage: IngestionFailure['stage'] = 'timeline';
    enter(stage);
    const work: RecordWork = {
      record,
      get stage() {
        return stage;
      },
      set stage(next) {
        stage = next;
        enter(next);
      },
      guard,
      site: async (call) => {
        guard.siteRequest = true;
        try {
          return await call();
        } finally {
          guard.siteRequest = false;
        }
      },
      // A pause follows only where another site section is coming; the model's
      // reading is outside the gate.
      endSiteSection: () =>
        hold?.release({ pauseAfter: queue.length > 0 || gate.pending > 0 }) ?? Promise.resolve(),
    };

    try {
      // Waiting for the gate is not the record's time: its deadline starts once
      // it has the site to itself.
      hold = await gate.acquire();
      await withDeadline(
        async () => {
          await catchUpDetail(work);
          if (guard.expired) return;
          await (fresh ? retrieve(work) : refresh(work));
        },
        deps.recordDeadlineMs,
        guard,
      );
    } catch (error) {
      await fail(work, fresh, error);
    } finally {
      // Whatever ended the record, the gate is not left held.
      await hold?.release();
      inFlight.delete(slot);
      report();
    }
  };

  const runner = async (slot: number): Promise<void> => {
    while (!stopped) {
      if (options.stopRequested?.()) {
        // Nothing is taken from the queue: what is left stays Queued, no attempt spent.
        stoppedBy = 'admin';
        stopped = true;
        logger.info('egp: run stopped by an administrator; the rest stay Queued');
        return;
      }
      const candidate = queue.shift();
      if (!candidate) return;
      if (options.shouldContinue && !options.shouldContinue()) {
        stopped = true;
        logger.warn('egp: run stopped before its next record; the rest stay Queued');
        return;
      }
      await processRecord(candidate, slot);
    }
  };

  const runners = Math.max(1, Math.min(options.runners ?? 1, queue.length));
  report();
  await Promise.all(Array.from({ length: runners }, (_, slot) => runner(slot)));

  logger.info(
    { attempted, refreshed, archivesRetrieved, torAnalysed, held, dropped, failed, aborted },
    'egp: run complete',
  );

  return {
    discovered: discovery.records.length,
    ...syncCounts,
    // The feed is asked per agency, so nothing arrives from outside the registry.
    rejectedNonRegistry: 0,
    attempted,
    refreshed,
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
