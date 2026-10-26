import type { IngestionFailure, Procurement } from '@torfun/types';
import type { ProcurementStore } from '../../repositories/procurement.repository';
import { RateLimitedError } from './client';

/**
 * One record's work in a Run, shared by its Retrieval turn and its Analysis:
 * what the steps can see of the record and of the Run, and the deadline both
 * are held to.
 */

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
export interface RecordGuard {
  expired: boolean;
  siteRequest: boolean;
  readonly controller: AbortController;
  /** One of this record's requests went unanswered once the site was known to be down. */
  siteDown: boolean;
}

/** What a Run's records came to, as counted in its result. */
export interface Tally {
  refreshed: number;
  archivesRetrieved: number;
  torAnalysed: number;
  held: number;
  dropped: number;
  failed: number;
}

/** One record's work in progress, shared by the steps that make it up. */
export interface RecordWork {
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
export type Handoff = () => Promise<void>;

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
export async function withDeadline(
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
