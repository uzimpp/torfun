import { MongoServerError, ObjectId, type Collection, type Db } from 'mongodb';
import type { TorReport } from '@torfun/types';

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
}

export interface TorReportStore {
  /** Null means this user already has a pending report for this TOR. */
  create(report: Omit<TorReport, 'id'>): Promise<TorReport | null>;
  list(limit: number, offset: number): Promise<{ items: TorReport[]; total: number }>;
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

  async list(limit: number, offset: number): Promise<{ items: TorReport[]; total: number }> {
    const collection = await this.collection();
    const [documents, total] = await Promise.all([
      collection.find().sort({ created_at: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
      collection.countDocuments(),
    ]);
    return { items: documents.map(toDomain), total };
  }
}
