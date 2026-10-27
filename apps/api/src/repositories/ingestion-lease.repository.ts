import type { Collection, Db } from 'mongodb';
import type { InFlightWork, LeaseLive } from '@torfun/types';
import { INGESTION_META_COLLECTION } from './ingestion-meta';

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
  /** Extend the lease, and with `live` replace what the Run last reported. False means it is no longer this holder's. */
  heartbeat(holder: string, now: Date, ttlMs: number, live?: LeaseLive): Promise<boolean>;
  /** Give the lease up. A no-op for anyone who does not hold it. */
  release(holder: string): Promise<void>;
  /** Whether any holder currently has an unexpired lease. */
  isHeld(now: Date): Promise<boolean>;
  /** The live lease, if any: who holds it, since when, and whether it has been asked to stop. */
  current(now: Date): Promise<LeaseState | null>;
  /**
   * Ask the live holder to stop, naming who asked. It lives on the lease so any
   * API instance can ask and the holder, wherever it runs, sees it at its next
   * heartbeat. The first request stands; asking again changes nothing. False
   * where no Run is in progress.
   */
  requestStop(by: string, now: Date): Promise<boolean>;
  /** Whether this holder has been asked to stop. */
  stopRequested(holder: string): Promise<boolean>;
}

export interface LeaseState {
  holder: string;
  acquiredAt: string;
  stopRequestedAt: string | null;
  stopRequestedBy: string | null;
  /** What the Run last reported through its heartbeat; null until its first. */
  live: LeaseLive | null;
}

interface InFlightDocument {
  slot: number;
  project_id: string;
  project_name: string;
  stage: InFlightWork['stage'];
  fresh: boolean;
  since: string;
}

/** One written by an older build may also carry memory fields; they are not read. */
interface LiveDocument {
  in_flight: InFlightDocument[];
  queue_remaining: number | null;
}

/**
 * Leases are transient (deleted on release, reset on takeover), so one an older
 * build left with live fields flat at its root is simply not read as live.
 */
interface LeaseDocument {
  _id: string;
  holder: string;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
  stop_requested_at?: string;
  stop_requested_by?: string;
  live?: LiveDocument;
}

function liveToDocument(live: LeaseLive): LiveDocument {
  return {
    in_flight: live.inFlight.map((work) => ({
      slot: work.slot,
      project_id: work.projectId,
      project_name: work.projectName,
      stage: work.stage,
      fresh: work.fresh,
      since: work.since,
    })),
    queue_remaining: live.queueRemaining,
  };
}

function liveFromDocument(document: LiveDocument | undefined): LeaseLive | null {
  if (!document) return null;
  return {
    inFlight: document.in_flight.map((work) => ({
      slot: work.slot,
      projectId: work.project_id,
      projectName: work.project_name,
      stage: work.stage,
      fresh: work.fresh,
      since: work.since,
    })),
    queueRemaining: document.queue_remaining,
  };
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
    return (await this.getDb()).collection<LeaseDocument>(INGESTION_META_COLLECTION);
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
          // A new Run starts clean: a request aimed at the one before is not
          // for this one, whether that lease was released or simply lapsed.
          $unset: { stop_requested_at: '', stop_requested_by: '', live: '' },
        },
        { upsert: true },
      );
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async heartbeat(holder: string, now: Date, ttlMs: number, live?: LeaseLive): Promise<boolean> {
    const at = now.toISOString();
    const result = await (
      await this.leases()
    ).updateOne(
      // Not expired: a holder whose lease lapsed may already have been replaced,
      // and must find out rather than quietly resume.
      { _id: LEASE_ID, holder, expires_at: { $gt: at } },
      {
        $set: {
          heartbeat_at: at,
          expires_at: new Date(now.getTime() + ttlMs).toISOString(),
          ...(live ? { live: liveToDocument(live) } : {}),
        },
      },
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

  async current(now: Date): Promise<LeaseState | null> {
    const found = await (
      await this.leases()
    ).findOne({ _id: LEASE_ID, expires_at: { $gt: now.toISOString() } });
    return found
      ? {
          holder: found.holder,
          acquiredAt: found.acquired_at,
          stopRequestedAt: found.stop_requested_at ?? null,
          stopRequestedBy: found.stop_requested_by ?? null,
          live: liveFromDocument(found.live),
        }
      : null;
  }

  async requestStop(by: string, now: Date): Promise<boolean> {
    const at = now.toISOString();
    const collection = await this.leases();
    // Only a live lease that has not been asked yet, so the first request stands.
    const result = await collection.updateOne(
      { _id: LEASE_ID, expires_at: { $gt: at }, stop_requested_at: { $exists: false } },
      { $set: { stop_requested_at: at, stop_requested_by: by } },
    );
    if (result.matchedCount === 1) return true;
    // Not matched: either nothing is running, or it was already asked.
    return (await collection.findOne({ _id: LEASE_ID, expires_at: { $gt: at } })) !== null;
  }

  async stopRequested(holder: string): Promise<boolean> {
    const found = await (await this.leases()).findOne({ _id: LEASE_ID, holder });
    return found?.stop_requested_at !== undefined;
  }
}
