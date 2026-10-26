import type { FastifyBaseLogger } from 'fastify';
import type { IngestionFailure, Procurement } from '@torfun/types';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import { RateLimitedError } from './client';
import { MAX_ATTEMPTS } from './constants';
import type { RecordWork, Tally } from './record-work';
import type { StopReason } from './run-control';
import { SiteClosedError, SiteLatchedError } from './site-gate';

/**
 * What a Run did to its records: how many it took up, what they came to, and
 * the failures logged against them, both in the Run's result and in the store's
 * failure log.
 */
export interface RunLedger {
  readonly tally: Tally;
  readonly failures: IngestionFailure[];
  /** Fresh records taken up; one turned away at the gate is not counted. */
  readonly attempted: number;
  /** A fresh record taken up: it counts as attempted and shows as downloading. */
  takeUp(record: Procurement): Promise<void>;
  /** Log a failure against a project, in the Run's result and the store. */
  note(
    about: Pick<Procurement, 'projectId' | 'projectName'>,
    stage: IngestionFailure['stage'],
    error: string,
    kind?: IngestionFailure['kind'],
  ): Promise<void>;
  /** Records why a record's work stopped; a refusal from the site stops the Run. */
  fail(work: RecordWork, fresh: boolean, error: unknown): Promise<void>;
}

export function createRunLedger(options: {
  repository: ProcurementStore;
  logger: FastifyBaseLogger;
  halt: (reason: StopReason) => void;
}): RunLedger {
  const { repository, logger } = options;
  const tally: Tally = {
    refreshed: 0,
    archivesRetrieved: 0,
    torAnalysed: 0,
    held: 0,
    dropped: 0,
    failed: 0,
  };
  const failures: IngestionFailure[] = [];
  let attempted = 0;

  const note: RunLedger['note'] = async (about, stage, error, kind = 'fault') => {
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

  return {
    tally,
    failures,
    get attempted() {
      return attempted;
    },
    async takeUp(record) {
      attempted += 1;
      await repository.transition(record.projectId, 'downloading');
    },
    note,
    async fail(work, fresh, error) {
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
        options.halt('refused');
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
    },
  };
}
