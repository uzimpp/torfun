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
  /** Where the gate's time has gone since it was made, up to now. */
  stats(): SiteGateStats;
}

/**
 * The gate's lifetime split three ways, which add up to it: held by a section
 * (`busyMs`), in the pause after one (`pausedMs`), and with nobody holding it
 * (`idleMs`). Nobody waits while the gate is free — `acquire` takes a free gate
 * at once, and a release hands it straight to the next waiter — so idle is also
 * "nobody waiting".
 */
export interface SiteGateStats {
  busyMs: number;
  pausedMs: number;
  idleMs: number;
  /** Holds granted; a refused acquirer is not one. */
  holds: number;
}

export function createSiteGate(deps: { pause: () => Promise<void>; now?: () => number }): SiteGate {
  const now = deps.now ?? Date.now;
  let held = false;
  let latched = false;
  const waiting: Array<{ grant: (hold: SiteGateHold) => void; refuse: () => void }> = [];

  // Only one hold is ever open, so the gate is in exactly one phase at a time.
  const spent = { busy: 0, paused: 0, idle: 0 };
  let phase: keyof typeof spent = 'idle';
  let since = now();
  let holds = 0;
  const enter = (next: keyof typeof spent) => {
    const at = now();
    spent[phase] += at - since;
    phase = next;
    since = at;
  };

  const makeHold = (): SiteGateHold => {
    let released = false;
    holds += 1;
    enter('busy');
    return {
      async release(options = {}) {
        if (released) return;
        released = true;
        if (!latched && options.pauseAfter !== false) {
          enter('paused');
          await deps.pause();
        }
        const next = waiting.shift();
        if (next && !latched) next.grant(makeHold());
        else {
          held = false;
          enter('idle');
        }
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

    stats() {
      const open = now() - since;
      return {
        busyMs: spent.busy + (phase === 'busy' ? open : 0),
        pausedMs: spent.paused + (phase === 'paused' ? open : 0),
        idleMs: spent.idle + (phase === 'idle' ? open : 0),
        holds,
      };
    },
  };

  return gate;
}
