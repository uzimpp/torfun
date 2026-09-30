import type { Collection, Db } from 'mongodb';

/**
 * The lock that makes "one Run at a time" true across processes.
 *
 * It lives beside the data because anything that can reach Mongo can start a
 * Run — the API, a second instance, a developer's machine — so an in-memory
 * flag can only ever speak for its own process. The lease expires, because a
 * holder that crashed must not lock the system out for ever; a live holder
 * keeps it by heartbeating.
 */
export interface IngestionLeaseStore {
  /** Take the lease if it is free, expired, or already this holder's. */
  acquire(holder: string, now: Date, ttlMs: number): Promise<boolean>;
  /** Extend the lease. False means it is no longer this holder's. */
  heartbeat(holder: string, now: Date, ttlMs: number): Promise<boolean>;
  /** Give the lease up. A no-op for anyone who does not hold it. */
  release(holder: string): Promise<void>;
  /** Whether any holder currently has an unexpired lease. */
  isHeld(now: Date): Promise<boolean>;
}

interface LeaseDocument {
  _id: string;
  holder: string;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
}

const LEASE_ID = 'run_lease';

/** Mongo's duplicate-key error, which is how a lost race announces itself. */
const DUPLICATE_KEY = 11000;

/**
 * Timestamps are stored as ISO strings, like every other date in this database;
 * they sort and compare correctly as text because they are all UTC `toISOString()`.
 */
export class IngestionLeaseRepository implements IngestionLeaseStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async leases(): Promise<Collection<LeaseDocument>> {
    return (await this.getDb()).collection<LeaseDocument>('ingestion_meta');
  }

  /**
   * One conditional upsert. It matches the lease only if it has expired or is
   * already ours; otherwise the upsert tries to insert a second document with
   * the same `_id`, and the duplicate-key error is the answer "someone else has
   * it". No read-then-write, so there is no window for two contenders to both win.
   */
  async acquire(holder: string, now: Date, ttlMs: number): Promise<boolean> {
    const at = now.toISOString();
    try {
      await (
        await this.leases()
      ).updateOne(
        { _id: LEASE_ID, $or: [{ expires_at: { $lte: at } }, { holder }] },
        {
          $set: {
            holder,
            acquired_at: at,
            heartbeat_at: at,
            expires_at: new Date(now.getTime() + ttlMs).toISOString(),
          },
        },
        { upsert: true },
      );
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async heartbeat(holder: string, now: Date, ttlMs: number): Promise<boolean> {
    const at = now.toISOString();
    const result = await (
      await this.leases()
    ).updateOne(
      // Not expired: a holder whose lease lapsed may already have been replaced,
      // and must find out rather than quietly resume.
      { _id: LEASE_ID, holder, expires_at: { $gt: at } },
      { $set: { heartbeat_at: at, expires_at: new Date(now.getTime() + ttlMs).toISOString() } },
    );
    return result.matchedCount === 1;
  }

  async release(holder: string): Promise<void> {
    await (await this.leases()).deleteOne({ _id: LEASE_ID, holder });
  }

  async isHeld(now: Date): Promise<boolean> {
    const found = await (
      await this.leases()
    ).findOne({ _id: LEASE_ID, expires_at: { $gt: now.toISOString() } });
    return found !== null;
  }
}
