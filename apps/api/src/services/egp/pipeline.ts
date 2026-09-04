import type { FastifyBaseLogger } from 'fastify';
import { unzipSync } from 'fflate';
import type { IngestionFailure, IngestionRecord } from '@torfun/types';
import type { IngestionRepository } from '../../repositories/ingestion-repository';
import { politeTorDelayMs, RateLimitedError, sleep } from './client';
import { discoverProjects } from './discovery';
import { downloadArchive, extractTorPdfs, resolveZipId } from './tor-package';

/**
 * Orchestrates the two ingestion stages against the repository.
 *
 * Split from the stage modules so those stay pure I/O over the upstream APIs
 * and this owns the policy: what to retrieve, in what order, how failures are
 * recorded, and when to stop.
 */

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
  torDownloaded: number;
  failed: number;
  aborted: boolean;
  failures: IngestionFailure[];
  ranAt: string;
}

/** Which records are worth spending an upstream request on, best first. */
function selectForRetrieval(
  repository: IngestionRepository,
  options: Pick<RunOptions, 'maxDownloads' | 'eBiddingOnly'>,
): IngestionRecord[] {
  const { items } = repository.find({
    state: 'Queued',
    ...(options.eBiddingOnly ? { eBidding: true } : {}),
    limit: options.maxDownloads,
    offset: 0,
  });
  // `find` already orders by software-likeness then contract value.
  return items;
}

/**
 * Run one full ingestion pass: discover, then retrieve TOR packages for the
 * most promising queued projects.
 *
 * Failures never abort the pass except a rate limit, which stops it entirely —
 * the correct response to a site signalling "stop" is to stop, not to retry
 * around it. Everything else is logged for Site Administrator review and the
 * pass continues.
 */
export async function runIngestion(
  repository: IngestionRepository,
  options: RunOptions,
): Promise<RunResult> {
  const { logger } = options;

  logger.info('egp: starting discovery sweep');
  const discovery = await discoverProjects(options.apiKey);

  let newRecords = 0;
  for (const record of discovery.records) {
    if (!repository.get(record.projectId)) newRecords += 1;
    repository.upsert(record);
  }
  repository.recordFailures(discovery.failures);
  repository.markRun(discovery.ranAt);

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
  const candidates = selectForRetrieval(repository, options);

  let torDownloaded = 0;
  let failed = 0;
  let attempted = 0;
  let aborted = false;

  for (const [index, record] of candidates.entries()) {
    attempted += 1;
    repository.transition(record.projectId, 'Processing', 'processing');

    try {
      const zipId = await resolveZipId(record.projectId);

      if (zipId === null) {
        // A real answer from upstream, not a transport error: this project
        // published no TOR package. Recorded as Failed because an admin is
        // left with nothing to read, but distinguished by its outcome.
        const failure: IngestionFailure = {
          projectId: record.projectId,
          projectName: record.projectName,
          stage: 'info',
          error: 'No zipId in the announcement response — no TOR package published.',
          at: new Date().toISOString(),
        };
        failures.push(failure);
        repository.recordFailures([failure]);
        repository.transition(record.projectId, 'Failed', 'no_tor_package', {}, failure.error);
        failed += 1;
      } else {
        const archive = await downloadArchive(zipId);
        const { torFiles, members, unsafeSkipped } = extractTorPdfs(archive, unzipSync);

        if (unsafeSkipped.length > 0) {
          // Never silently dropped: a path-traversal attempt in a government
          // archive is exactly the thing an administrator should see.
          const failure: IngestionFailure = {
            projectId: record.projectId,
            projectName: record.projectName,
            stage: 'extract',
            error: `Archive members rejected by the path-traversal guard: ${unsafeSkipped.join(', ')}`,
            at: new Date().toISOString(),
          };
          failures.push(failure);
          repository.recordFailures([failure]);
        }

        const patch = {
          zipId,
          zipBytes: archive.length,
          archiveMemberCount: members.length,
          torFiles,
          error: null,
        };

        if (torFiles.length > 0) {
          repository.transition(record.projectId, 'Completed', 'tor_downloaded', patch);
          torDownloaded += 1;
        } else {
          const failure: IngestionFailure = {
            projectId: record.projectId,
            projectName: record.projectName,
            stage: 'extract',
            error: `Archive downloaded (${members.length} members) but contains no TOR-named PDF.`,
            at: new Date().toISOString(),
          };
          failures.push(failure);
          repository.recordFailures([failure]);
          repository.transition(record.projectId, 'Completed', 'no_tor_in_archive', patch);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof RateLimitedError) {
        // The site is telling us to stop. Stop — leaving the rest Queued for a
        // later run rather than pushing through.
        repository.transition(record.projectId, 'Failed', 'error', { error: message }, message);
        failures.push({
          projectId: record.projectId,
          projectName: record.projectName,
          stage: 'download',
          error: message,
          at: new Date().toISOString(),
        });
        repository.recordFailures(failures.slice(-1));
        failed += 1;
        aborted = true;
        logger.warn({ projectId: record.projectId }, 'egp: rate limited, aborting run');
        break;
      }

      const failure: IngestionFailure = {
        projectId: record.projectId,
        projectName: record.projectName,
        stage: 'download',
        error: message,
        at: new Date().toISOString(),
      };
      failures.push(failure);
      repository.recordFailures([failure]);
      repository.transition(record.projectId, 'Failed', 'error', { error: message }, message);
      failed += 1;
    }

    if (index < candidates.length - 1) {
      await sleep(politeTorDelayMs());
    }
  }

  logger.info({ attempted, torDownloaded, failed, aborted }, 'egp: run complete');

  return {
    discovered: discovery.records.length,
    newRecords,
    rejectedNonRegistry: discovery.rejected.length,
    attempted,
    torDownloaded,
    failed,
    aborted,
    failures,
    ranAt: discovery.ranAt,
  };
}
