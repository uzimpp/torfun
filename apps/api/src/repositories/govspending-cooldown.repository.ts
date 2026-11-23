import { MongoServerError, type Collection, type Db } from 'mongodb';
import { INGESTION_META_COLLECTION } from './ingestion-meta';

export interface GovSpendingCooldownStore {
  getCooldownUntil(): Promise<string | null>;
  extendCooldown(until: string, updatedAt: string): Promise<void>;
}

interface GovSpendingCooldownDocument {
  _id: string;
  cooldown_until: string;
  updated_at: string;
}

const COOLDOWN_ID = 'govspending_cooldown';

export class GovSpendingCooldownRepository implements GovSpendingCooldownStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<GovSpendingCooldownDocument>> {
    return (await this.getDb()).collection<GovSpendingCooldownDocument>(
      INGESTION_META_COLLECTION,
    );
  }

  async getCooldownUntil(): Promise<string | null> {
    const document = await (await this.records()).findOne({ _id: COOLDOWN_ID });
    return document?.cooldown_until ?? null;
  }

  async extendCooldown(until: string, updatedAt: string): Promise<void> {
    const records = await this.records();
    const update = {
      $max: { cooldown_until: until },
      $set: { updated_at: updatedAt },
    };

    try {
      await records.updateOne({ _id: COOLDOWN_ID }, update, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      await records.updateOne({ _id: COOLDOWN_ID }, update);
    }
  }
}
