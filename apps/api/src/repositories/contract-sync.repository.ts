import type { ContractSync } from '@torfun/types';
import { MongoServerError, type Collection, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';

export interface ContractSyncStore {
  claim(year: number, now: string, leaseUntil: string): Promise<string | null>;

  renew(year: number, claimToken: string, leaseUntil: string, at: string): Promise<boolean>;

  markCompleted(year: number, claimToken: string, at: string, generation?: string): Promise<void>;

  markFailed(
    year: number,
    claimToken: string,
    failure: {
      at: string;
      retryAt: string;
      error: string;
    },
  ): Promise<void>;
}

interface ContractSyncDocument {
  _id: number;
  status: ContractSync['status'];
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  lease_until: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  claim_token: string | null;
  active_generation: string | null;
  updated_at: string;
}

export class ContractSyncRepository implements ContractSyncStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ContractSyncDocument>> {
    return (await this.getDb()).collection<ContractSyncDocument>('contract_syncs');
  }

  private emptyDocument(year: number, now: string): Omit<ContractSyncDocument, '_id'> {
    return {
      status: 'pending',
      attempts: 0,
      last_attempt_at: null,
      next_attempt_at: null,
      lease_until: null,
      last_synced_at: null,
      last_error: null,
      claim_token: null,
      active_generation: null,
      updated_at: now,
    };
  }

  private async ensureYearDocument(year: number, now: string): Promise<void> {
    try {
      await (
        await this.records()
      ).updateOne(
        { _id: year },
        {
          $setOnInsert: this.emptyDocument(year, now),
        },
        { upsert: true },
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        return;
      }

      throw error;
    }
  }

  async claim(year: number, now: string, leaseUntil: string): Promise<string | null> {
    await this.ensureYearDocument(year, now);

    const records = await this.records();
    const claimToken = randomUUID();

    const result = await records.updateOne(
      {
        _id: year,
        $or: [
          { status: 'pending' },
          {
            status: 'failed',
            $or: [
              { next_attempt_at: null },
              { next_attempt_at: { $exists: false } },
              { next_attempt_at: { $lte: now } },
            ],
          },
          {
            status: 'processing',
            $or: [
              { lease_until: null },
              { lease_until: { $exists: false } },
              { lease_until: { $lte: now } },
            ],
          },
        ],
      },
      {
        $set: {
          status: 'processing',
          last_attempt_at: now,
          next_attempt_at: null,
          lease_until: leaseUntil,
          last_error: null,
          claim_token: claimToken,
          updated_at: now,
        },
        $inc: {
          attempts: 1,
        },
      },
    );

    return result.modifiedCount === 1 ? claimToken : null;
  }

  async renew(year: number, claimToken: string, leaseUntil: string, at: string): Promise<boolean> {
    const result = await (
      await this.records()
    ).updateOne(
      { _id: year, status: 'processing', claim_token: claimToken },
      { $set: { lease_until: leaseUntil, updated_at: at } },
    );
    return result.matchedCount === 1;
  }

  async markCompleted(
    year: number,
    claimToken: string,
    at: string,
    generation?: string,
  ): Promise<void> {
    const records = await this.records();

    const result = await records.updateOne(
      {
        _id: year,
        status: 'processing',
        claim_token: claimToken,
      },
      {
        $set: {
          status: 'completed',
          lease_until: null,
          next_attempt_at: null,
          last_synced_at: at,
          last_error: null,
          claim_token: null,
          ...(generation === undefined ? {} : { active_generation: generation }),
          updated_at: at,
        },
      },
    );

    if (result.matchedCount !== 1) {
      throw new Error('Contract sync claim is no longer owned by this worker');
    }
  }

  async markFailed(
    year: number,
    claimToken: string,
    failure: {
      at: string;
      retryAt: string;
      error: string;
    },
  ): Promise<void> {
    const records = await this.records();

    const result = await records.updateOne(
      {
        _id: year,
        status: 'processing',
        claim_token: claimToken,
      },
      {
        $set: {
          status: 'failed',
          lease_until: null,
          next_attempt_at: failure.retryAt,
          last_error: failure.error,
          claim_token: null,
          updated_at: failure.at,
        },
      },
    );

    if (result.matchedCount !== 1) {
      throw new Error('Contract sync claim is no longer owned by this worker');
    }
  }
}
