import type { IngestionLeaseStore, LeaseState } from '../repositories/ingestion-lease.repository';

/**
 * An in-memory `IngestionLeaseStore` for driving the service without Mongo.
 *
 * Same rules as the real one — free, expired or the holder's own may be taken;
 * a heartbeat only for the live holder; release only by the holder — so a
 * service test cannot pass against a lock that is more forgiving than
 * production's. The real repository's atomicity is proved against Mongo in its
 * own tests; here there is only one thread, so nothing can interleave.
 */
export class InMemoryIngestionLease implements IngestionLeaseStore {
  private held: {
    holder: string;
    expiresAt: number;
    acquiredAt: string;
    stop: { at: string; by: string } | null;
  } | null = null;

  async acquire(holder: string, now: Date, ttlMs: number): Promise<boolean> {
    const current = this.held;
    if (current && current.holder !== holder && current.expiresAt > now.getTime()) return false;
    this.held = {
      holder,
      expiresAt: now.getTime() + ttlMs,
      acquiredAt: now.toISOString(),
      stop: null,
    };
    return true;
  }

  async heartbeat(holder: string, now: Date, ttlMs: number): Promise<boolean> {
    const current = this.held;
    if (!current || current.holder !== holder || current.expiresAt <= now.getTime()) return false;
    this.held = { ...current, expiresAt: now.getTime() + ttlMs };
    return true;
  }

  async release(holder: string): Promise<void> {
    if (this.held?.holder === holder) this.held = null;
  }

  async isHeld(now: Date): Promise<boolean> {
    return this.held !== null && this.held.expiresAt > now.getTime();
  }

  async current(now: Date): Promise<LeaseState | null> {
    const held = this.held;
    if (!held || held.expiresAt <= now.getTime()) return null;
    return {
      holder: held.holder,
      acquiredAt: held.acquiredAt,
      stopRequestedAt: held.stop?.at ?? null,
      stopRequestedBy: held.stop?.by ?? null,
    };
  }

  async requestStop(by: string, now: Date): Promise<boolean> {
    const held = this.held;
    if (!held || held.expiresAt <= now.getTime()) return false;
    held.stop ??= { at: now.toISOString(), by };
    return true;
  }

  async stopRequested(holder: string): Promise<boolean> {
    return this.held?.holder === holder && this.held.stop !== null;
  }
}
