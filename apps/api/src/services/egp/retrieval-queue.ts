import type { Procurement } from '@torfun/types';
import type { Limiter } from './concurrency';

/**
 * One unit of a Run's work. A fresh record is retrieved and read; a refresh is a
 * record already read, whose timeline is looked at again and which is worked on
 * further only if the invitation has moved.
 */
export interface Candidate {
  record: Procurement;
  fresh: boolean;
  /**
   * A refresh put back because its invitation moved while the waiting room was
   * full: it takes a place before its next turn, as a fresh record does.
   */
  withPlace?: boolean;
}

/** A candidate to take now, with the waiting-room place it needs, if any. */
export interface Pick {
  candidate: Candidate;
  place?: () => void;
}

/**
 * Retrieval's queue: never-read projects first, then refreshes, and the waiting
 * room both draw on (ADR-0020).
 */
export interface RetrievalQueue {
  /** Add a candidate. A project is queued once per Run, however many ways it is found. */
  enqueue(candidate: Candidate): void;
  /**
   * Put a refresh back, at the end, to take a place before its next turn. Not
   * subject to de-duplication: it was taken from this queue.
   */
  putBack(candidate: Candidate): void;
  /**
   * The next project to take, with the waiting-room place it needs, if any.
   *
   * Never-read projects go first, but each needs a place before its turn. When
   * the room is full the gate goes on serving refreshes, which take no place up
   * front (ADR-0020), so a full room does not hold them up behind fresh work.
   * Null when nothing can be taken now: the queue is empty, or everything in it
   * needs a place and none is free.
   */
  pick(): Pick | null;
  /**
   * A place in the waiting room if one is free now, never waited for. Giving it
   * back wakes Retrieval, which may be waiting for one.
   */
  takePlace(): (() => void) | null;
  /**
   * Wait for new work, Discovery's end, a place, or a stop. Each of them wakes
   * this, so it must be asked straight after a `pick` that found nothing.
   */
  waitForWork(): Promise<void>;
  /** Wakes Retrieval if it is waiting. */
  wake(): void;
  /** Discovery has finished, or there is none: nothing new will join. */
  endDiscovery(): void;
  /** Discovery has finished and nothing is left in the queue. */
  readonly drained: boolean;
  /** How many are waiting to be taken. */
  readonly length: number;
  /** Marks the queue's first filling done, so the live view may show its length. */
  built(): void;
  /** The live view's queue count: null until the queue is first filled. */
  readonly remaining: number | null;
}

export function createRetrievalQueue(options: {
  /** The waiting room: Archives held in memory, waiting for or under Analysis. */
  room: Limiter;
  /** Told whenever what is queued changes. */
  onChange: () => void;
}): RetrievalQueue {
  const fresh: Candidate[] = [];
  const refresh: Candidate[] = [];
  const queued = new Set<string>();
  let isBuilt = false;
  let discoveryDone = false;
  let waiting: (() => void) | null = null;

  const length = () => fresh.length + refresh.length;
  const wake = () => {
    const resolve = waiting;
    waiting = null;
    resolve?.();
  };
  const takePlace = (): (() => void) | null => {
    const release = options.room.tryAcquire();
    if (!release) return null;
    return () => {
      release();
      wake();
    };
  };

  return {
    enqueue(candidate) {
      if (queued.has(candidate.record.projectId)) return;
      queued.add(candidate.record.projectId);
      (candidate.fresh ? fresh : refresh).push(candidate);
      options.onChange();
      wake();
    },
    putBack(candidate) {
      refresh.push(candidate);
      options.onChange();
    },
    pick() {
      const needsPlace = fresh.length > 0 || refresh.some((each) => each.withPlace);
      const place = needsPlace ? takePlace() : null;
      if (place && fresh.length > 0) return { candidate: fresh.shift()!, place };
      const index = refresh.findIndex((each) => !each.withPlace || place);
      if (index < 0) return null;
      const [candidate] = refresh.splice(index, 1) as [Candidate];
      if (candidate.withPlace) return { candidate, place: place! };
      place?.();
      return { candidate };
    },
    takePlace,
    waitForWork() {
      return new Promise<void>((resolve) => {
        waiting = resolve;
      });
    },
    wake,
    endDiscovery() {
      discoveryDone = true;
      wake();
    },
    get drained() {
      return discoveryDone && length() === 0;
    },
    get length() {
      return length();
    },
    built() {
      isBuilt = true;
    },
    get remaining() {
      return isBuilt ? length() : null;
    },
  };
}
