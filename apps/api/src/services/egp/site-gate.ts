import { RateLimitedError } from './client';

/**
 * What lets more than one runner share the upstream site without breaking the
 * terms it is used under.
 *
 * `gprocurement.go.th` is reached under a research authorisation, and the code
 * keeps to its spirit: single-file requests, a politeness delay between them,
 * and a hard stop on a rate-limit response (there is no volume cap; ADR-0015).
 * Several runners could each honour those on their own and still, together,
 * break them. So the terms live in one place that every runner
 * goes through:
 *
 *  - at most one site section in flight, across all runners;
 *  - a pause after each, taken before the next may begin;
 *  - FIFO, so no runner is starved;
 *  - released even when the section throws, and never before it has settled;
 *  - a refusal latches it, and every runner — waiting or arriving later — is
 *    refused in turn without touching the site.
 *
 * Work that is not a site request (the model reading a PDF) runs outside it.
 */

/** Raised to a runner that did not itself meet a refusal but must stop as if it had. */
export class SiteLatchedError extends RateLimitedError {
  constructor() {
    super('the upstream site', 429);
    this.message = 'Upstream site access is stopped: another request was refused.';
    this.name = 'SiteLatchedError';
  }
}

export interface SiteGateHold {
  /**
   * Free the gate. The pause runs first and the gate stays held through it, so
   * the next section cannot begin early. Safe to call more than once.
   */
  release(options?: { pauseAfter?: boolean }): Promise<void>;
}

export interface SiteGate {
  /** Wait for the gate; throws `SiteLatchedError` if it is, or becomes, latched. */
  acquire(): Promise<SiteGateHold>;
  /** Stop all site access: pending and future acquirers are refused. */
  latch(): void;
  /** How many are waiting for the gate right now. */
  readonly pending: number;
}

export function createSiteGate(deps: { pause: () => Promise<void> }): SiteGate {
  let held = false;
  let latched = false;
  const waiting: Array<{ grant: (hold: SiteGateHold) => void; refuse: () => void }> = [];

  const makeHold = (): SiteGateHold => {
    let released = false;
    return {
      async release(options = {}) {
        if (released) return;
        released = true;
        if (!latched && options.pauseAfter !== false) await deps.pause();
        const next = waiting.shift();
        if (next && !latched) next.grant(makeHold());
        else held = false;
      },
    };
  };

  const gate: SiteGate = {
    async acquire() {
      if (latched) throw new SiteLatchedError();
      if (!held) {
        held = true;
        return makeHold();
      }
      return new Promise<SiteGateHold>((grant, reject) => {
        waiting.push({ grant, refuse: () => reject(new SiteLatchedError()) });
      });
    },

    latch() {
      latched = true;
      for (const waiter of waiting.splice(0)) waiter.refuse();
    },

    get pending() {
      return waiting.length;
    },
  };

  return gate;
}
