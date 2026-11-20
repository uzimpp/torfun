import { randomUUID } from 'node:crypto';
import { MongoServerError, type Db } from 'mongodb';
import {
  defaultNotificationPreferences,
  preferencesToDomain,
  preferencesToResponse,
  type NotificationContact,
  type NotificationPreferences,
  type NotificationSettings,
} from '@torfun/types';

interface ContactDocument {
  _id: string;
  preferences: NotificationPreferences;
  email: string | null;
  email_verified_at: string | null;
  email_token_hash?: string;
  email_token_expires_at?: Date;
  line_user_id?: string | null;
  line_following: boolean;
}
interface NonceDocument {
  _id: string;
  user_id: string;
  expires_at: Date;
}

function toDomain(row: ContactDocument): NotificationContact {
  return {
    userId: row._id,
    preferences: preferencesToDomain(row.preferences),
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    lineUserId: row.line_user_id ?? null,
    lineFollowing: row.line_following,
  };
}

export type WebhookClaim = { kind: 'claimed'; token: string } | { kind: 'done' } | { kind: 'busy' };

export interface NotificationContactStore {
  ensureIndexes?(): Promise<void>;
  get(userId: string): Promise<NotificationContact>;
  savePreferences(userId: string, value: NotificationSettings): Promise<void>;
  beginEmail(userId: string, email: string, hash: string, expires: Date): Promise<void>;
  verifyEmail(userId: string, hash: string, now: Date): Promise<boolean>;
  disconnectEmail(userId: string): Promise<void>;
  saveNonce(userId: string, nonce: string, expires: Date): Promise<void>;
  nonceUser(nonce: string, now: Date): Promise<string | null>;
  linkLine(nonce: string, lineUserId: string, now: Date): Promise<boolean>;
  setFollowing(lineUserId: string, following: boolean): Promise<void>;
  disconnectLine(userId: string): Promise<void>;
  claimWebhook(id: string, now: Date): Promise<WebhookClaim>;
  finishWebhook(id: string, leaseToken: string): Promise<void>;
}

export class NotificationContactRepository implements NotificationContactStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  async ensureIndexes() {
    const db = await this.getDb();
    await db
      .collection('notification_contacts')
      .createIndex(
        { line_user_id: 1 },
        { unique: true, partialFilterExpression: { line_user_id: { $type: 'string' } } },
      );
    await db
      .collection('notification_link_nonces')
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await db
      .collection('notification_webhooks')
      .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  }

  async get(userId: string): Promise<NotificationContact> {
    const collection = (await this.getDb()).collection<ContactDocument>('notification_contacts');
    const row = await collection.findOne({ _id: userId });
    return row
      ? toDomain(row)
      : {
          userId,
          preferences: preferencesToDomain(defaultNotificationPreferences()),
          email: null,
          emailVerifiedAt: null,
          lineUserId: null,
          lineFollowing: false,
        };
  }

  private async ensure(userId: string) {
    await (await this.getDb()).collection<ContactDocument>('notification_contacts').updateOne(
      { _id: userId },
      {
        $setOnInsert: {
          preferences: defaultNotificationPreferences(),
          email: null,
          email_verified_at: null,
          line_following: false,
        },
      },
      { upsert: true },
    );
  }

  async savePreferences(userId: string, value: NotificationSettings) {
    await this.ensure(userId);
    await (
      await this.getDb()
    )
      .collection<ContactDocument>('notification_contacts')
      .updateOne({ _id: userId }, { $set: { preferences: preferencesToResponse(value) } });
  }

  async beginEmail(userId: string, email: string, hash: string, expires: Date) {
    await this.ensure(userId);
    await (await this.getDb()).collection<ContactDocument>('notification_contacts').updateOne(
      { _id: userId },
      {
        $set: {
          email,
          email_verified_at: null,
          email_token_hash: hash,
          email_token_expires_at: expires,
        },
      },
    );
  }

  async verifyEmail(userId: string, hash: string, now: Date) {
    const result = await (
      await this.getDb()
    )
      .collection<ContactDocument>('notification_contacts')
      .updateOne(
        { _id: userId, email_token_hash: hash, email_token_expires_at: { $gt: now } },
        {
          $set: { email_verified_at: now.toISOString() },
          $unset: { email_token_hash: '', email_token_expires_at: '' },
        },
      );
    return result.modifiedCount === 1;
  }

  async disconnectEmail(userId: string) {
    await (await this.getDb()).collection<ContactDocument>('notification_contacts').updateOne(
      { _id: userId },
      {
        $set: { email: null, email_verified_at: null },
        $unset: { email_token_hash: '', email_token_expires_at: '' },
      },
    );
  }

  async saveNonce(userId: string, nonce: string, expires: Date) {
    await this.ensure(userId);
    await (
      await this.getDb()
    )
      .collection<NonceDocument>('notification_link_nonces')
      .insertOne({ _id: nonce, user_id: userId, expires_at: expires });
  }

  async linkLine(nonce: string, lineUserId: string, now: Date) {
    await this.ensureIndexes();
    const db = await this.getDb();
    const session = db.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const nonces = db.collection<NonceDocument>('notification_link_nonces');
        const pending = await nonces.findOneAndDelete(
          { _id: nonce, expires_at: { $gt: now } },
          { session },
        );
        if (!pending) return false;
        await db
          .collection<ContactDocument>('notification_contacts')
          .updateOne(
            { _id: pending.user_id },
            { $set: { line_user_id: lineUserId, line_following: true } },
            { session },
          );
        return true;
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async nonceUser(nonce: string, now: Date) {
    return (
      (
        await (
          await this.getDb()
        )
          .collection<NonceDocument>('notification_link_nonces')
          .findOne({ _id: nonce, expires_at: { $gt: now } })
      )?.user_id ?? null
    );
  }

  async setFollowing(lineUserId: string, following: boolean) {
    await (
      await this.getDb()
    )
      .collection<ContactDocument>('notification_contacts')
      .updateOne({ line_user_id: lineUserId }, { $set: { line_following: following } });
  }

  async disconnectLine(userId: string) {
    const db = await this.getDb();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await db
          .collection<ContactDocument>('notification_contacts')
          .updateOne(
            { _id: userId },
            { $unset: { line_user_id: '' }, $set: { line_following: false } },
            { session },
          );
        // A callback already in flight must not reconnect an explicitly unlinked account.
        await db
          .collection<NonceDocument>('notification_link_nonces')
          .deleteMany({ user_id: userId }, { session });
      });
    } finally {
      await session.endSession();
    }
  }

  async claimWebhook(id: string, now: Date): Promise<WebhookClaim> {
    const collection = (await this.getDb()).collection<{
      _id: string;
      done: boolean;
      lease_until: Date;
      lease_token: string;
      expires_at: Date;
    }>('notification_webhooks');
    const token = randomUUID();
    try {
      const row = await collection.findOneAndUpdate(
        {
          _id: id,
          done: { $ne: true },
          $or: [{ lease_until: { $lte: now } }, { lease_until: { $exists: false } }],
        },
        {
          $set: {
            done: false,
            lease_token: token,
            lease_until: new Date(now.getTime() + 60000),
            expires_at: new Date(now.getTime() + 7 * 86400000),
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      return row ? { kind: 'claimed', token } : { kind: 'busy' };
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await collection.findOne({ _id: id });
        return { kind: existing?.done ? 'done' : 'busy' };
      }
      throw error;
    }
  }

  async finishWebhook(id: string, leaseToken: string) {
    await (
      await this.getDb()
    )
      .collection<{ _id: string; lease_token: string; done: boolean }>('notification_webhooks')
      .updateOne({ _id: id, lease_token: leaseToken }, { $set: { done: true } });
  }
}
