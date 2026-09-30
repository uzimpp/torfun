import type { FastifyBaseLogger } from 'fastify';
import { unzipSync } from 'fflate';
import type { ArchiveDocument, IngestionFailure, Procurement, TorAnalysis } from '@torfun/types';
import type { Env } from '../../config/env';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import {
  classifyTorDocument,
  type DocumentClassification,
  type ModelStatus,
} from '../vertex/classify-document';
import { createOversizeReaders } from '../vertex/oversize-readers';
import { createModelCall } from '../vertex/vertex-ai';
import { politeTorDelayMs, RateLimitedError, sleep } from './client';
import { mapWithConcurrency } from './concurrency';
import {
  ANALYSIS_CONCURRENCY,
  MAX_ATTEMPTS,
  RECORD_DEADLINE_MS,
  STALE_PROCESSING_MS,
} from './constants';
import { discoverProjects, type DiscoveryResult } from './discovery';
import { assignDocumentRoles, type ClassifiedDocument } from './document-roles';
import {
  downloadArchive,
  extractTorPdfs,
  resolveZipId,
  type ExtractionResult,
} from './tor-package';

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
  discoverProjects: (apiKey: string) => Promise<DiscoveryResult>;
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
    extractTorPdfs: (archive) => extractTorPdfs(archive, unzipSync),
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
  /**
   * Cap on TOR retrievals in one run. The upstream site asked not to be
   * crawled (robots.txt is Disallow: /) and the owner's authorisation is for
   * low-volume research, so a run is bounded rather than draining the queue.
   */
  maxDownloads: number;
  /**
   * Restrict retrieval to competitive tenders. TOR availability tracks the
   * tender method almost perfectly, so this is the difference between a queue
   * that mostly succeeds and one that mostly logs "no package published".
   */
  eBiddingOnly: boolean;
  logger: FastifyBaseLogger;
  /**
   * Asked before each record. A Run cannot be cancelled mid-record, so this is
   * where one that no longer holds the right to run — its lease was taken
   * over — stops rather than overlap another Run's requests to the site.
   */
  shouldContinue?: () => boolean;
}

export interface RunResult {
  discovered: number;
  newRecords: number;
  rejectedNonRegistry: number;
  attempted: number;
  /** Announcement archives successfully retrieved, whatever was in them. */
  archivesRetrieved: number;
  /** Retrievals that ended with a TOR identified and read. */
  torAnalysed: number;
  failed: number;
  aborted: boolean;
  failures: IngestionFailure[];
  ranAt: string;
}

/** Which records are worth spending an upstream request on, best first. */
async function selectForRetrieval(
  repository: ProcurementStore,
  options: Pick<RunOptions, 'maxDownloads' | 'eBiddingOnly'>,
): Promise<Procurement[]> {
  const { items } = await repository.find({
    state: 'Queued',
    // In the query, not filtered afterwards: an exhausted record must not use up
    // one of the capped slots in a run.
    attemptsBelow: MAX_ATTEMPTS,
    ...(options.eBiddingOnly ? { eBidding: true } : {}),
    limit: options.maxDownloads,
    offset: 0,
  });
  // `find` already orders by biddable status, then software-likeness, then value.
  return items;
}

interface AnalysedArchive {
  documents: ArchiveDocument[];
  analysis: TorAnalysis | null;
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
      const classification = await classifyDocument(Buffer.from(pdf.payload));
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

  logger.info('egp: starting discovery sweep');
  const discovery = await deps.discoverProjects(options.apiKey);

  let newRecords = 0;
  for (const record of discovery.records) {
    if (!(await repository.get(record.projectId))) newRecords += 1;
    await repository.upsert(record);
  }
  await repository.recordFailures(discovery.failures);
  await repository.markRun(discovery.ranAt);

  logger.info(
    {
      discovered: discovery.records.length,
      newRecords,
      rejected: discovery.rejected.length,
      failures: discovery.failures.length,
    },
    'egp: discovery complete',
  );

  const failures: IngestionFailure[] = [...discovery.failures];

  if (discovery.rateLimited) {
    // The open-data API said stop. Everything found so far is kept, and nothing
    // more is asked of any upstream this Run — the same rule as for the site.
    logger.warn('egp: open-data API rate limited discovery, stopping the run');
    return {
      discovered: discovery.records.length,
      newRecords,
      rejectedNonRegistry: discovery.rejected.length,
      attempted: 0,
      archivesRetrieved: 0,
      torAnalysed: 0,
      failed: 0,
      aborted: true,
      failures,
      ranAt: discovery.ranAt,
    };
  }

  const candidates = await selectForRetrieval(repository, options);

  let archivesRetrieved = 0;
  let torAnalysed = 0;
  let failed = 0;
  let attempted = 0;
  let aborted = false;

  const note = async (failure: IngestionFailure) => {
    failures.push(failure);
    await repository.recordFailures([failure]);
  };

  for (const [index, record] of candidates.entries()) {
    if (options.shouldContinue && !options.shouldContinue()) {
      aborted = true;
      logger.warn('egp: run stopped before its next record; the rest stay Queued');
      break;
    }

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

    try {
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
              zipBytes: archive.length,
              archiveMemberCount: extraction.members.length,
              archiveMembers: extraction.members,
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

            if (analysed.analysis !== null) {
              // The TOR was read either way; whether it is software work is the
              // model's judgement, kept as an outcome so the record stays visible
              // and can be overruled rather than dropped.
              const outcome = analysed.analysis.isSoftwareProject ? 'tor_analysed' : 'not_software';
              await repository.transition(record.projectId, outcome, patch);
              torAnalysed += 1;
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

      if (error instanceof RateLimitedError) {
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
        logger.warn({ projectId: record.projectId }, 'egp: rate limited, aborting run');
        break;
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
    }

    if (index < candidates.length - 1) {
      await deps.sleep(politeTorDelayMs());
    }
  }

  logger.info({ attempted, archivesRetrieved, torAnalysed, failed, aborted }, 'egp: run complete');

  return {
    discovered: discovery.records.length,
    newRecords,
    rejectedNonRegistry: discovery.rejected.length,
    attempted,
    archivesRetrieved,
    torAnalysed,
    failed,
    aborted,
    failures,
    ranAt: discovery.ranAt,
  };
}
