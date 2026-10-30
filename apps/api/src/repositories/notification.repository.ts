import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession, Db } from 'mongodb';
import type {
  Notification,
  NotificationChannel,
  NotificationDelivery,
  NotificationDeliveryFailure,
  NotificationObservation,
  NotificationObservationPlan,
  ProcurementStatus,
} from '@torfun/types';

interface NotificationDocument {
  _id: string;
  user_id: string;
  company_id: string;
  project_id: string;
  project_name: string;
  event: Notification['event'];
  score: number;
  reasons: string[];
  previous_status: ProcurementStatus | null;
  status: ProcurementStatus;
  deadline_at: string | null;
  in_app: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}
interface ObservationDocument {
  _id: string;
  matched_at: string | null;
  status: ProcurementStatus;
  revision: number;
  source_updated_at: string;
}
interface DeliveryDocument {
  _id: string;
  notification_id: string;
  channel: NotificationChannel;
  recipient: string;
  state: 'pending' | 'sending' | 'retry' | 'accepted' | 'failed' | 'skipped';
  attempts: number;
  retry_key: string;
  lease_token?: string;
  lease_until?: Date;
  next_attempt_at: Date;
  created_at: string;
  error?: string;
  finished_at?: string;
}

function toDocument(n: Notification): NotificationDocument {
  return {
    _id: n.id,
    user_id: n.userId,
    company_id: n.companyId,
    project_id: n.projectId,
    project_name: n.projectName,
    event: n.event,
    score: n.score,
    reasons: n.reasons,
    previous_status: n.previousStatus,
    status: n.status,
    deadline_at: n.deadlineAt,
    in_app: n.inApp,
    read_at: n.readAt,
    dismissed_at: n.dismissedAt,
    created_at: n.createdAt,
  };
}
function toDomain(n: NotificationDocument): Notification {
  return {
    id: n._id,
    userId: n.user_id,
    companyId: n.company_id,
    projectId: n.project_id,
    projectName: n.project_name,
    event: n.event,
    score: n.score,
    reasons: n.reasons,
    previousStatus: n.previous_status,
    status: n.status,
    deadlineAt: n.deadline_at,
    inApp: n.in_app,
    readAt: n.read_at,
    dismissedAt: n.dismissed_at,
    createdAt: n.created_at,
  };
}
const key = (...parts: string[]) =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex');

export interface NotificationStore {
  ensureIndexes?(): Promise<void>;
  observe(
    id: string,
    decide: (previous: NotificationObservation | null) => NotificationObservationPlan | null,
  ): Promise<void>;
  list(
    userId: string,
    companyId: string,
    unread: boolean,
    limit: number,
    offset: number,
    visibleIds?: string[],
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }>;
  projectIds(userId: string, companyId: string): Promise<string[]>;
  update(
    userId: string,
    companyId: string,
    id: string,
    action: 'read' | 'dismiss',
    now: Date,
  ): Promise<boolean>;
  readAll(userId: string, companyId: string, projectIds: string[], now: Date): Promise<void>;
  claimDelivery(now: Date, maxAttempts: number): Promise<NotificationDelivery | null>;
  finishDelivery(
    job: NotificationDelivery,
    state: 'accepted' | 'failed' | 'skipped' | 'retry',
    error: string | null,
    next: Date,
  ): Promise<void>;
  cursor(companyId: string): Promise<string>;
  saveCursor(companyId: string, projectId: string): Promise<void>;
  failures(): Promise<NotificationDeliveryFailure[]>;
  retry(id: string, now: Date, createdAfter: Date): Promise<boolean>;
}

export class NotificationRepository implements NotificationStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  async ensureIndexes() {
    const db = await this.getDb();
    await db
      .collection('notifications')
      .createIndexes([
        { key: { user_id: 1, company_id: 1, in_app: 1, dismissed_at: 1, created_at: -1, _id: -1 } },
        { key: { user_id: 1, company_id: 1, project_id: 1 } },
      ]);
    await db
      .collection('notification_deliveries')
      .createIndex({ state: 1, next_attempt_at: 1, lease_until: 1 });
  }

  /** Persist the service's pure decision with the observation read in this transaction. */
  async observe(
    id: string,
    decide: (previous: NotificationObservation | null) => NotificationObservationPlan | null,
  ) {
    const db = await this.getDb();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const observations = db.collection<ObservationDocument>('notification_observations');
        const row = await observations.findOne({ _id: id }, { session });
        const previous: NotificationObservation | null = row
          ? {
              id: row._id,
              matchedAt: row.matched_at,
              status: row.status,
              revision: row.revision,
              sourceUpdatedAt: row.source_updated_at,
            }
          : null;
        const plan = decide(previous);
        if (!plan) return;
        const observation = plan.observation;
        await observations.updateOne(
          { _id: id },
          {
            $set: {
              matched_at: observation.matchedAt,
              status: observation.status,
              revision: observation.revision,
              source_updated_at: observation.sourceUpdatedAt,
            },
          },
          { upsert: true, session },
        );
        if (!plan.notification) return;
        const n = plan.notification;
        await db
          .collection<NotificationDocument>('notifications')
          .updateOne({ _id: n.id }, { $setOnInsert: toDocument(n) }, { upsert: true, session });
        for (const delivery of plan.deliveries)
          await this.enqueue(db, session, n, delivery.channel, delivery.recipient);
      });
    } finally {
      await session.endSession();
    }
  }

  private async enqueue(
    db: Db,
    session: ClientSession,
    n: Notification,
    channel: NotificationChannel,
    recipient: string,
  ) {
    await db.collection<DeliveryDocument>('notification_deliveries').updateOne(
      { _id: key(n.id, channel) },
      {
        $setOnInsert: {
          notification_id: n.id,
          channel,
          recipient,
          state: 'pending',
          attempts: 0,
          retry_key: randomUUID(),
          next_attempt_at: new Date(n.createdAt),
          created_at: n.createdAt,
        },
      },
      { upsert: true, session },
    );
  }

  async projectIds(userId: string, companyId: string) {
    return (await this.getDb())
      .collection<NotificationDocument>('notifications')
      .distinct('project_id', {
        user_id: userId,
        company_id: companyId,
        in_app: true,
        dismissed_at: null,
      });
  }

  async list(
    userId: string,
    companyId: string,
    unread: boolean,
    limit: number,
    offset: number,
    visibleIds: string[] = [],
  ) {
    const collection = (await this.getDb()).collection<NotificationDocument>('notifications');
    const base = {
      user_id: userId,
      company_id: companyId,
      in_app: true,
      dismissed_at: null,
      project_id: { $in: visibleIds },
    };
    const filter = { ...base, ...(unread ? { read_at: null } : {}) };
    const [items, total, unreadCount] = await Promise.all([
      collection.find(filter).sort({ created_at: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
      collection.countDocuments(filter),
      collection.countDocuments({ ...base, read_at: null }),
    ]);
    return { items: items.map(toDomain), total, unreadCount };
  }

  async update(
    userId: string,
    companyId: string,
    id: string,
    action: 'read' | 'dismiss',
    now: Date,
  ) {
    const result = await (
      await this.getDb()
    )
      .collection<NotificationDocument>('notifications')
      .updateOne(
        { _id: id, user_id: userId, company_id: companyId, in_app: true },
        {
          $set:
            action === 'read'
              ? { read_at: now.toISOString() }
              : { dismissed_at: now.toISOString() },
        },
      );
    return result.matchedCount === 1;
  }

  async readAll(userId: string, companyId: string, projectIds: string[], now: Date) {
    await (await this.getDb()).collection<NotificationDocument>('notifications').updateMany(
      {
        user_id: userId,
        company_id: companyId,
        project_id: { $in: projectIds },
        in_app: true,
        dismissed_at: null,
        read_at: null,
      },
      { $set: { read_at: now.toISOString() } },
    );
  }

  async claimDelivery(now: Date, maxAttempts: number): Promise<NotificationDelivery | null> {
    const db = await this.getDb();
    const collection = db.collection<DeliveryDocument>('notification_deliveries');
    // A process dying on its last attempt must still become a visible failure.
    await collection.updateMany(
      { state: 'sending', attempts: { $gte: maxAttempts }, lease_until: { $lte: now } },
      {
        $set: {
          state: 'failed',
          error: 'Worker stopped during the final attempt; acceptance is unknown',
        },
      },
    );
    const token = randomUUID();
    const job = await collection.findOneAndUpdate(
      {
        state: { $in: ['pending', 'retry', 'sending'] },
        attempts: { $lt: maxAttempts },
        next_attempt_at: { $lte: now },
        $or: [{ lease_until: { $exists: false } }, { lease_until: { $lte: now } }],
      },
      {
        $set: {
          state: 'sending',
          lease_token: token,
          lease_until: new Date(now.getTime() + 90000),
        },
        $inc: { attempts: 1 },
      },
      { sort: { next_attempt_at: 1, _id: 1 }, returnDocument: 'after' },
    );
    if (!job) return null;
    const notification = await db
      .collection<NotificationDocument>('notifications')
      .findOne({ _id: job.notification_id });
    if (!notification) {
      await collection.updateOne(
        { _id: job._id, lease_token: token },
        { $set: { state: 'failed', error: 'Notification record is missing' } },
      );
      return null;
    }
    return {
      id: job._id,
      notification: toDomain(notification),
      channel: job.channel,
      recipient: job.recipient,
      attempts: job.attempts,
      retryKey: job.retry_key,
      leaseToken: token,
      createdAt: job.created_at,
    };
  }

  async finishDelivery(
    job: NotificationDelivery,
    state: 'accepted' | 'failed' | 'skipped' | 'retry',
    error: string | null,
    next: Date,
  ) {
    await (await this.getDb()).collection<DeliveryDocument>('notification_deliveries').updateOne(
      { _id: job.id, lease_token: job.leaseToken },
      {
        $set: {
          state,
          ...(error ? { error } : {}),
          next_attempt_at: next,
          ...(state !== 'retry' ? { finished_at: new Date().toISOString() } : {}),
        },
        $unset: { lease_token: '', lease_until: '', ...(!error ? { error: '' } : {}) },
      },
    );
  }

  async cursor(companyId: string) {
    const row = await (
      await this.getDb()
    )
      .collection<{ _id: string; project_id: string }>('notification_cursors')
      .findOne({ _id: companyId });
    return row?.project_id ?? '';
  }
  async saveCursor(companyId: string, projectId: string) {
    await (
      await this.getDb()
    )
      .collection<{ _id: string; project_id: string }>('notification_cursors')
      .updateOne({ _id: companyId }, { $set: { project_id: projectId } }, { upsert: true });
  }

  async failures(): Promise<NotificationDeliveryFailure[]> {
    const rows = await (
      await this.getDb()
    )
      .collection<DeliveryDocument>('notification_deliveries')
      .find({ state: { $in: ['failed', 'retry'] } })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();
    return rows.map((row) => ({
      id: row._id,
      channel: row.channel,
      attempts: row.attempts,
      error: row.error ?? null,
      createdAt: row.created_at,
      state: row.state === 'retry' ? 'retry' : 'failed',
    }));
  }

  async retry(id: string, now: Date, createdAfter: Date) {
    // After 24h an old LINE key no longer prevents a duplicate. Never replace it silently.
    const result = await (
      await this.getDb()
    )
      .collection<DeliveryDocument>('notification_deliveries')
      .updateOne(
        {
          _id: id,
          state: 'failed',
          created_at: { $gt: createdAfter.toISOString() },
        },
        {
          $set: { state: 'retry', attempts: 0, next_attempt_at: now },
          $unset: { error: '', lease_token: '', lease_until: '' },
        },
      );
    return result.modifiedCount === 1;
  }
}
