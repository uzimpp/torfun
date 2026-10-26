import type { FastifyBaseLogger } from 'fastify';
import { SiteUnavailableError, UnreachableError } from './client';
import { SITE_UNREACHABLE_AFTER } from './constants';
import type { RecordGuard } from './record-work';
import type { SiteGate } from './site-gate';

/**
 * Whether a Run may go on, and why it stopped once it may not.
 *
 * Every way a Run stops goes through `halt`, which shuts the gate so no further
 * request is made. A refusal latches it; every other reason closes it, so the
 * stop does not read as the site saying no.
 */

/** Why a Run stopped: the site refused, stopped answering, put up a page in place of data, an administrator asked, the lease was lost, or the store failed. */
export type StopReason = 'refused' | 'unreachable' | 'unavailable' | 'admin' | 'lease' | 'error';

/**
 * Where the Run stands. `reason` is the first reason it stopped for. A request
 * already in flight then may still be refused or go unanswered, and that is
 * still the site speaking, so `refused` and `siteDown` record it whatever the
 * reason was.
 */
export type RunStatus =
  | { kind: 'running' }
  | { kind: 'stopped'; reason: StopReason; refused: boolean; siteDown: boolean };

/** How a Run's stop shows in its result. */
export interface RunEnding {
  /** The site refused (429/403) at some point, and the Run stopped there. */
  aborted: boolean;
  /** An administrator's stop, where that was the reason; else null. */
  stopped: 'admin' | null;
  /** Why a sweep that began did not finish, where the site is the reason. */
  discoveryStopped: 'rate_limited' | 'unreachable' | 'unavailable' | null;
}

/**
 * The result's view of a status. `sweep` is how Discovery's sweep ended, null
 * where there was none or it failed. A site that stopped answering shows as
 * Discovery's reason even when Retrieval met it, or there was no sweep; a
 * refusal shows there only where the sweep itself was cut short by it.
 */
export function runEnding(
  status: RunStatus,
  sweep: { rateLimited: boolean; unreachable: boolean } | null,
): RunEnding {
  const stopped = status.kind === 'stopped' ? status : null;
  return {
    aborted: stopped?.refused ?? false,
    stopped: stopped?.reason === 'admin' ? 'admin' : null,
    discoveryStopped:
      stopped?.reason === 'unavailable'
        ? 'unavailable'
        : sweep?.rateLimited
          ? 'rate_limited'
          : stopped?.siteDown || sweep?.unreachable
            ? 'unreachable'
            : null,
  };
}

export interface RunControl {
  readonly status: RunStatus;
  /** Stop the Run for `reason`, shutting the gate. Only the first reason is kept. */
  halt(reason: StopReason): void;
  /**
   * Notice a stop asked for since the last look (an administrator's, or a lost
   * lease) and stop the Run for it, which closes the gate.
   */
  noticeStop(): void;
  /** Asked before each record; false once the Run is stopping. */
  mayGoOn(): boolean;
  /**
   * Make one request to the site, counting it toward the unreachable streak.
   * Every request passes through here, Discovery's and Retrieval's alike, so a
   * dead site is noticed however the two interleave. `record` is the guard of
   * the record the request is for, if any.
   */
  askSite<T>(call: () => Promise<T>, record?: RecordGuard): Promise<T>;
}

export function createRunControl(options: {
  gate: SiteGate;
  logger: FastifyBaseLogger;
  /** An administrator's request to stop. */
  stopRequested?: () => boolean;
  /** False once the Run no longer holds its lease. */
  shouldContinue?: () => boolean;
  /** Told once, when the Run stops, so work waiting for something wakes to see it. */
  onStop: () => void;
}): RunControl {
  const { gate, logger } = options;
  let status: RunStatus = { kind: 'running' };
  /** Requests in a row, across the whole Run, that got no answer at all. */
  let silent = 0;

  const halt = (reason: StopReason): void => {
    if (reason === 'refused') {
      // Even after a stop for another reason: a request already in flight then
      // may still be refused, and that is still the site saying stop.
      gate.latch();
      if (status.kind === 'stopped') status = { ...status, refused: true };
    }
    if (status.kind === 'stopped') return;
    status = { kind: 'stopped', reason, refused: reason === 'refused', siteDown: false };
    if (reason !== 'refused') {
      gate.close(reason === 'unreachable' || reason === 'unavailable' ? reason : 'stopped');
    }
    options.onStop();
  };

  const noticeStop = (): void => {
    if (status.kind === 'stopped') return;
    if (options.stopRequested?.()) {
      logger.info('egp: run stopped by an administrator; the rest stay Queued');
      halt('admin');
    } else if (options.shouldContinue && !options.shouldContinue()) {
      logger.warn('egp: run stopped before its next request; the rest stay Queued');
      halt('lease');
    }
  };

  const siteDown = () => status.kind === 'stopped' && status.siteDown;

  return {
    get status() {
      return status;
    },
    halt,
    noticeStop,
    mayGoOn() {
      noticeStop();
      return status.kind === 'running';
    },
    async askSite(call, record) {
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
        if (silent >= SITE_UNREACHABLE_AFTER && !siteDown()) {
          // Shown as the site not answering; Discovery, if it is running, learns
          // of it from the closed gate.
          logger.warn({ silent }, 'egp: the site stopped answering; the Run stops here');
          halt('unreachable');
          if (status.kind === 'stopped') status = { ...status, siteDown: true };
        }
        if (error instanceof SiteUnavailableError && !siteDown()) {
          logger.warn('egp: the site sent a web page in place of data; the Run stops here');
          halt('unavailable');
          if (status.kind === 'stopped') status = { ...status, siteDown: true };
        }
        if ((unanswered || error instanceof SiteUnavailableError) && siteDown() && record) {
          record.siteDown = true;
        }
        throw error;
      }
    },
  };
}
