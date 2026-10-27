import { MongoServerError, ObjectId, type Collection, type Db } from 'mongodb';
import type { ReviewTorReport, TorReport, TorReportFilter, TorReportReview } from '@torfun/types';

interface ReportDocument {
  _id: ObjectId;
  project_id: string;
  project_name: string;
  dept_name: string;
  reporter_id: string;
  reporter_username: string;
  reporter_full_name: string;
  reporter_email: string | null;
  reason: TorReport['reason'];
  details: string | null;
  status: TorReport['status'];
  created_at: string;
  review?: {
    reviewer_id: string;
    reviewer_username: string;
    reviewer_full_name: string;
    reviewer_email: string | null;
    reviewed_at: string;
    note: string | null;
  };
}

export type ReviewReportResult =
  | { kind: 'reviewed'; report: TorReport }
  | { kind: 'not_found' | 'already_reviewed' | 'project_missing' };

export interface TorReportStore {
  /** Null means this user already has a pending report for this TOR. */
  create(report: Omit<TorReport, 'id'>): Promise<TorReport | null>;
  list(
    limit: number,
    offset: number,
    status?: TorReportFilter,
  ): Promise<{ items: TorReport[]; total: number }>;
  review(id: string, input: ReviewTorReport, review: TorReportReview): Promise<ReviewReportResult>;
}

function toDomain(document: ReportDocument): TorReport {
  return {
    id: document._id.toHexString(),
    projectId: document.project_id,
    projectName: document.project_name,
    deptName: document.dept_name,
    reporter: {
      id: document.reporter_id,
      username: document.reporter_username,
      fullName: document.reporter_full_name,
      email: document.reporter_email,
    },
    reason: document.reason,
    details: document.details,
    status: document.status,
    createdAt: document.created_at,
    review: document.review
      ? {
          reviewer: {
            id: document.review.reviewer_id,
            username: document.review.reviewer_username,
            fullName: document.review.reviewer_full_name,
            email: document.review.reviewer_email,
          },
          reviewedAt: document.review.reviewed_at,
          note: document.review.note,
        }
      : null,
  };
}

export class TorReportRepository implements TorReportStore {
  private initialized: Promise<Collection<ReportDocument>> | undefined;

  constructor(private readonly getDb: () => Promise<Db>) {}

  private collection(): Promise<Collection<ReportDocument>> {
    // Lazy like the other repositories. The unique index also protects retries
    // and simultaneous submissions across API instances.
    return (this.initialized ??= this.getDb()
      .then(async (db) => {
        const collection = db.collection<ReportDocument>('tor_reports');
        await collection.createIndex(
          { project_id: 1, reporter_id: 1 },
          {
            unique: true,
            partialFilterExpression: { status: 'pending' },
            name: 'one_pending_report',
          },
        );
        await collection.createIndex({ created_at: -1, _id: -1 });
        await collection.createIndex({ status: 1, created_at: -1, _id: -1 });
        return collection;
      })
      .catch((error: unknown) => {
        this.initialized = undefined;
        throw error;
      }));
  }

  async create(report: Omit<TorReport, 'id'>): Promise<TorReport | null> {
    const collection = await this.collection();
    const document: ReportDocument = {
      _id: new ObjectId(),
      project_id: report.projectId,
      project_name: report.projectName,
      dept_name: report.deptName,
      reporter_id: report.reporter.id,
      reporter_username: report.reporter.username,
      reporter_full_name: report.reporter.fullName,
      reporter_email: report.reporter.email,
      reason: report.reason,
      details: report.details,
      status: report.status,
      created_at: report.createdAt,
    };
    try {
      await collection.insertOne(document);
      return toDomain(document);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return null;
      throw error;
    }
  }

  async list(
    limit: number,
    offset: number,
    status: TorReportFilter = 'pending',
  ): Promise<{ items: TorReport[]; total: number }> {
    const collection = await this.collection();
    const filter = status === 'all' ? {} : { status };
    const [documents, total] = await Promise.all([
      collection.find(filter).sort({ created_at: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    return { items: documents.map(toDomain), total };
  }

  async review(
    id: string,
    input: ReviewTorReport,
    review: TorReportReview,
  ): Promise<ReviewReportResult> {
    if (!ObjectId.isValid(id)) return { kind: 'not_found' };
    const collection = await this.collection();
    const db = await this.getDb();
    const session = db.client.startSession();
    try {
      // One transaction: a report must never say "removed" while its TOR is
      // still published. Conditional writes also settle concurrent reviewers.
      return await session.withTransaction(
        async () => {
          const report = await collection.findOne({ _id: new ObjectId(id) }, { session });
          if (!report) return { kind: 'not_found' } as const;
          if (report.status !== 'pending') return { kind: 'already_reviewed' } as const;
          const procurements = db.collection<{
            _id: string;
            unpublished: { by: string; at: string; report_id: string } | null;
          }>('procurements');
          if (
            input.action === 'remove_tor' &&
            !(await procurements.findOne(
              { _id: report.project_id },
              { session, projection: { _id: 1 } },
            ))
          ) {
            return { kind: 'project_missing' } as const;
          }
          const updated = await collection.findOneAndUpdate(
            { _id: report._id, status: 'pending' },
            {
              $set: {
                status: input.action === 'dismiss' ? 'dismissed' : 'removed',
                review: {
                  reviewer_id: review.reviewer.id,
                  reviewer_username: review.reviewer.username,
                  reviewer_full_name: review.reviewer.fullName,
                  reviewer_email: review.reviewer.email,
                  reviewed_at: review.reviewedAt,
                  note: review.note,
                },
              },
            },
            { session, returnDocument: 'after' },
          );
          if (!updated) return { kind: 'already_reviewed' } as const;
          if (input.action === 'remove_tor') {
            await procurements.updateOne(
              { _id: report.project_id, unpublished: null },
              {
                $set: {
                  unpublished: {
                    by: review.reviewer.username,
                    at: review.reviewedAt,
                    report_id: id,
                  },
                },
              },
              { session },
            );
          }
          return { kind: 'reviewed', report: toDomain(updated) } as const;
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
  }
}
