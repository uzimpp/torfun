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
 *  - when it frees, the best tier waiting goes next (`GATE_TIERS`), first come
 *    first served within a tier. A worse tier can wait, but not for ever: a Run
 *    does not end until its work is done (ADR-0020);
 *  - released even when the section throws, and never before it has settled;
 *  - a refusal latches it, and every runner — waiting or arriving later — is
 *    refused in turn without touching the site.
 *
 * Work that is not a site request (the model reading a PDF) runs outside it.
 */

/**
 * What a turn at the gate is for, best first: Discovery's new days, retrieval of
 * projects never read, timeline refreshes, then Discovery's history (ADR-0020).
 */
export const GATE_TIERS = ['new_day', 'fresh', 'refresh', 'history'] as const;
export type GateTier = (typeof GATE_TIERS)[number];

/** Raised to a runner that did not itself meet a refusal but must stop as if it had. */
export class SiteLatchedError extends RateLimitedError {
  constructor() {
    super('the upstream site', 429);
    this.message = 'Upstream site access is stopped: another request was refused.';
    this.name = 'SiteLatchedError';
  }
}

/**
 * Raised to a caller of a gate closed for a reason other than a refusal: an
 * administrator's stop, a lost lease, a site that stopped answering. Not a
 * rate limit, so nothing that meets it reads it as the site saying no.
 */
export class SiteClosedError extends Error {
  /** `unreachable` where the site stopped answering; `stopped` for every other reason. */
  constructor(readonly reason: SiteClosedReason = 'stopped') {
    super(
      reason === 'unreachable'
        ? 'Upstream site access is closed: the site stopped answering.'
        : 'Upstream site access is closed: the Run is stopping.',
    );
    this.name = 'SiteClosedError';
  }
}

export type SiteClosedReason = 'unreachable' | 'stopped';

export interface SiteGateHold {
  /**
   * Free the gate. The pause runs first and the gate stays held through it, so
   * the next section cannot begin early. Safe to call more than once.
   */
  release(options?: { pauseAfter?: boolean }): Promise<void>;
}

export interface SiteGate {
  /**
   * Wait for the gate, behind any waiter of a better tier; throws
   * `SiteLatchedError` if it is, or becomes, latched.
   */
  acquire(tier: GateTier): Promise<SiteGateHold>;
  /** Stop all site access: pending and future acquirers are refused. */
  latch(): void;
  /**
   * Stop all site access for a reason that is not a refusal: pending and future
   * acquirers get `SiteClosedError`. A section in flight finishes as usual. A
   * latch, before or after, wins.
   */
  close(reason?: SiteClosedReason): void;
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
  let closed: SiteClosedReason | false = false;
  type Waiter = {
    grant: (hold: SiteGateHold) => void;
    refuse: (error: Error) => void;
  };
  // One line per tier, in GATE_TIERS order.
  const waiting: Record<GateTier, Waiter[]> = { new_day: [], fresh: [], refresh: [], history: [] };
  const nextWaiter = () => {
    const tier = GATE_TIERS.find((each) => waiting[each].length > 0);
    return tier ? waiting[tier].shift() : undefined;
  };

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

  const refuseAll = (error: () => Error) => {
    for (const tier of GATE_TIERS)
      for (const waiter of waiting[tier].splice(0)) waiter.refuse(error());
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
        const next = latched || closed ? undefined : nextWaiter();
        if (next) next.grant(makeHold());
        else {
          held = false;
          enter('idle');
        }
      },
    };
  };

  const gate: SiteGate = {
    async acquire(tier) {
      if (latched) throw new SiteLatchedError();
      if (closed) throw new SiteClosedError(closed);
      if (!held) {
        held = true;
        return makeHold();
      }
      return new Promise<SiteGateHold>((grant, refuse) => {
        waiting[tier].push({ grant, refuse });
      });
    },

    latch() {
      latched = true;
      refuseAll(() => new SiteLatchedError());
    },

    close(reason = 'stopped') {
      if (latched || closed) return;
      closed = reason;
      refuseAll(() => new SiteClosedError(reason));
    },

    get pending() {
      return GATE_TIERS.reduce((sum, tier) => sum + waiting[tier].length, 0);
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
