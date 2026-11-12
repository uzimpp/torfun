import type { InFlightWork, RunProgress } from '@torfun/types';

/**
 * What a Run is working on right now, as the administrator's live view shows
 * it: one line per piece of work, plus the queue count.
 */

/** Where each kind of work shows: Discovery, the Retrieval turn, then each Analysis. */
export const DISCOVERY_SLOT = 0;
export const RETRIEVAL_SLOT = 1;

export interface LiveView {
  /** Show `work` on its line, in place of `replacing`'s where it moves there from another. */
  show(work: InFlightWork, replacing?: number): void;
  /** Take a line out of the view. */
  remove(slot: number): void;
  /** The first line free after the Retrieval turn's, for an Analysis. */
  lowestFreeSlot(): number;
  /** Tell the listener where the Run stands. */
  report(): void;
}

export function createLiveView(options: {
  onProgress?: (progress: RunProgress) => void;
  /** The queue count to show, null while it is not yet known. */
  queueRemaining: () => number | null;
}): LiveView {
  const inFlight = new Map<number, InFlightWork>();
  const report = () =>
    options.onProgress?.({
      inFlight: [...inFlight.values()].sort((a, b) => a.slot - b.slot),
      queueRemaining: options.queueRemaining(),
    });

  return {
    show(work, replacing) {
      if (replacing !== undefined) inFlight.delete(replacing);
      inFlight.set(work.slot, work);
      report();
    },
    remove(slot) {
      inFlight.delete(slot);
      report();
    },
    lowestFreeSlot() {
      let slot = RETRIEVAL_SLOT + 1;
      while (inFlight.has(slot)) slot += 1;
      return slot;
    },
    report,
  };
}
