import type { ContractEnrichment } from '@torfun/types';
import { MongoServerError, type Collection, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';

export interface ContractEnrichmentStore {
  claim(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    now: string,
    leaseUntil: string,
  ): Promise<string | null>;

  renew(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    claimToken: string,
    leaseUntil: string,
    at: string,
  ): Promise<boolean>;

  markCompleted(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    claimToken: string,
    at: string,
    generation?: string,
  ): Promise<void>;

  markFailed(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    claimToken: string,
    failure: {
      at: string;
      retryAt: string;
      error: string;
    },
  ): Promise<void>;
}

interface ContractEnrichmentTaskDocument {
  status: ContractEnrichment['submissions']['status'];
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  lease_until: string | null;
  last_error: string | null;
  claim_token: string | null;
}

interface ContractEnrichmentDocument {
  _id: string;
  project_id: string;
  contract_year: number;
  active_generation: string | null;
  submissions: ContractEnrichmentTaskDocument;
  updated_at: string;
}

export class ContractEnrichmentRepository implements ContractEnrichmentStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ContractEnrichmentDocument>> {
    return (await this.getDb()).collection<ContractEnrichmentDocument>('contract_enrichments');
  }

  private emptyTask(): ContractEnrichmentTaskDocument {
    return {
      status: 'pending',
      attempts: 0,
      last_attempt_at: null,
      next_attempt_at: null,
      lease_until: null,
      last_error: null,
      claim_token: null,
    };
  }

  private async ensureProjectDocument(
    projectId: string,
    contractYear: number,
    now: string,
  ): Promise<void> {
    const id = `${projectId}:${contractYear}`;
    try {
      await (
        await this.records()
      ).updateOne(
        { _id: id },
        {
          $setOnInsert: {
            project_id: projectId,
            contract_year: contractYear,
            active_generation: null,
            submissions: this.emptyTask(),
            updated_at: now,
          },
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

  async claim(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    now: string,
    leaseUntil: string,
  ): Promise<string | null> {
    await this.ensureProjectDocument(projectId, contractYear, now);

    const records = await this.records();
    const claimToken = randomUUID();
    const id = `${projectId}:${contractYear}`;

    const statusPath = `${source}.status`;
    const retryPath = `${source}.next_attempt_at`;
    const leasePath = `${source}.lease_until`;

    const result = await records.updateOne(
      {
        _id: id,
        $or: [
          { [statusPath]: 'pending' },
          {
            [statusPath]: 'failed',
            $or: [
              { [retryPath]: null },
              { [retryPath]: { $exists: false } },
              { [retryPath]: { $lte: now } },
            ],
          },
          {
            [statusPath]: 'processing',
            $or: [
              { [leasePath]: null },
              { [leasePath]: { $exists: false } },
              { [leasePath]: { $lte: now } },
            ],
          },
        ],
      },
      {
        $set: {
          [statusPath]: 'processing',
          [`${source}.last_attempt_at`]: now,
          [retryPath]: null,
          [leasePath]: leaseUntil,
          [`${source}.last_error`]: null,
          [`${source}.claim_token`]: claimToken,
          updated_at: now,
        },
        $inc: {
          [`${source}.attempts`]: 1,
        },
      },
    );

    return result.modifiedCount === 1 ? claimToken : null;
  }

  async renew(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    claimToken: string,
    leaseUntil: string,
    at: string,
  ): Promise<boolean> {
    const result = await (
      await this.records()
    ).updateOne(
      {
        _id: `${projectId}:${contractYear}`,
        [`${source}.status`]: 'processing',
        [`${source}.claim_token`]: claimToken,
      },
      { $set: { [`${source}.lease_until`]: leaseUntil, updated_at: at } },
    );
    return result.matchedCount === 1;
  }

  async markCompleted(
    projectId: string,
    contractYear: number,
    source: 'submissions',
    claimToken: string,
    at: string,
    generation?: string,
  ): Promise<void> {
    const records = await this.records();

    const result = await records.updateOne(
      {
        _id: `${projectId}:${contractYear}`,
        [`${source}.status`]: 'processing',
        [`${source}.claim_token`]: claimToken,
      },
      {
        $set: {
          [`${source}.status`]: 'completed',
          [`${source}.lease_until`]: null,
          [`${source}.next_attempt_at`]: null,
          [`${source}.last_error`]: null,
          [`${source}.claim_token`]: null,
          ...(generation === undefined ? {} : { active_generation: generation }),
          updated_at: at,
        },
      },
    );

    if (result.matchedCount !== 1) {
      throw new Error('Enrichment claim is no longer owned by this worker');
    }
  }

  async markFailed(
    projectId: string,
    contractYear: number,
    source: 'submissions',
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
        _id: `${projectId}:${contractYear}`,
        [`${source}.status`]: 'processing',
        [`${source}.claim_token`]: claimToken,
      },
      {
        $set: {
          [`${source}.status`]: 'failed',
          [`${source}.lease_until`]: null,
          [`${source}.next_attempt_at`]: failure.retryAt,
          [`${source}.last_error`]: failure.error,
          [`${source}.claim_token`]: null,
          updated_at: failure.at,
        },
      },
    );

    if (result.matchedCount !== 1) {
      throw new Error('Enrichment claim is no longer owned by this worker');
    }
  }
}
