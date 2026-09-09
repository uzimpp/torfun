import type { FastifyBaseLogger } from 'fastify';
import { unzipSync } from 'fflate';
import type { ArchiveDocument, IngestionFailure, Procurement, TorAnalysis } from '@torfun/types';
import type { Env } from '../../config/env';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import { classifyTorDocument, type DocumentClassification } from '../vertex/classify-document';
import { createModelCall } from '../vertex/vertex-ai';
import { politeTorDelayMs, RateLimitedError, sleep } from './client';
import { discoverProjects, type DiscoveryResult } from './discovery';
import { assignDocumentRoles, type ClassifiedDocument } from './document-roles';
import { downloadArchive, extractTorPdfs, resolveZipId, type ExtractionResult } from './tor-package';

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
  resolveZipId: (projectId: string) => Promise<string | null>;
  downloadArchive: (zipId: string) => Promise<Uint8Array>;
  extractTorPdfs: (archive: Uint8Array) => ExtractionResult;
  classifyDocument: (pdf: Buffer) => Promise<DocumentClassification>;
  sleep: (ms: number) => Promise<void>;
}

export function createIngestionDeps(env: Env): IngestionDeps {
  const callModel = createModelCall(env);
  return {
    discoverProjects,
    resolveZipId,
    downloadArchive,
    extractTorPdfs: (archive) => extractTorPdfs(archive, unzipSync),
    classifyDocument: (pdf) => classifyTorDocument(callModel, pdf),
    sleep,
  };
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
  const candidates: ClassifiedDocument[] = [];

  for (const pdf of extraction.torFiles) {
    const classification = await classifyDocument(Buffer.from(pdf.payload));
    byMember.set(pdf.member, classification);
    candidates.push({
      member: pdf.member,
      filename: pdf.filename,
      bytes: pdf.bytes,
      namePattern: pdf.namePattern,
      isTor: classification.isTor,
      torKind: classification.torKind,
      whatThisIs: classification.whatThisIs,
      unreadable: classification.unreadable,
    });
  }

  const { documents, mainTor, ambiguous } = assignDocumentRoles(candidates);

  return {
    documents,
    analysis: mainTor ? (byMember.get(mainTor.member)?.analysis ?? null) : null,
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
    attempted += 1;
    await repository.transition(record.projectId, 'Processing', 'processing');

    try {
      const zipId = await deps.resolveZipId(record.projectId);

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
        await repository.transition(record.projectId, 'Failed', 'no_tor_package', {}, error);
        failed += 1;
      } else {
        const archive = await deps.downloadArchive(zipId);
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

        const analysed = await analyseArchive(extraction, deps.classifyDocument);

        // Note what is NOT here: extraction.torFiles carries the PDF payloads,
        // and they stop at this line. Only the manifest is persisted (ADR-0002).
        const patch: Partial<Procurement> = {
          zipId,
          zipBytes: archive.length,
          archiveMemberCount: extraction.members.length,
          documents: analysed.documents,
          analysis: analysed.analysis,
          torAmbiguous: analysed.torAmbiguous,
        };

        if (analysed.analysis !== null) {
          await repository.transition(record.projectId, 'Completed', 'tor_analysed', patch);
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
          await repository.transition(record.projectId, 'Completed', 'analysis_failed', patch);
        } else {
          await note({
            projectId: record.projectId,
            projectName: record.projectName,
            stage: 'extract',
            error: `Archive downloaded (${extraction.members.length} members) but none of its documents is a TOR.`,
            at: new Date().toISOString(),
          });
          await repository.transition(record.projectId, 'Completed', 'no_tor_in_archive', patch);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof RateLimitedError) {
        // The site is telling us to stop. Stop — leaving the rest Queued for a
        // later run rather than pushing through.
        await repository.transition(record.projectId, 'Failed', 'error', {}, message);
        await note({
          projectId: record.projectId,
          projectName: record.projectName,
          stage: 'download',
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
        stage: 'download',
        error: message,
        at: new Date().toISOString(),
      });
      await repository.transition(record.projectId, 'Failed', 'error', {}, message);
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
