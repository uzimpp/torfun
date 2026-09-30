import type { IngestionLeaseStore } from '../repositories/ingestion-lease.repository';

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
  private held: { holder: string; expiresAt: number } | null = null;

  async acquire(holder: string, now: Date, ttlMs: number): Promise<boolean> {
    const current = this.held;
    if (current && current.holder !== holder && current.expiresAt > now.getTime()) return false;
    this.held = { holder, expiresAt: now.getTime() + ttlMs };
    return true;
  }

  async heartbeat(holder: string, now: Date, ttlMs: number): Promise<boolean> {
    const current = this.held;
    if (!current || current.holder !== holder || current.expiresAt <= now.getTime()) return false;
    this.held = { holder, expiresAt: now.getTime() + ttlMs };
    return true;
  }

  async release(holder: string): Promise<void> {
    if (this.held?.holder === holder) this.held = null;
  }

  async isHeld(now: Date): Promise<boolean> {
    return this.held !== null && this.held.expiresAt > now.getTime();
  }
}
