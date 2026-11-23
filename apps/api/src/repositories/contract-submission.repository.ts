import type { ContractSubmission } from '@torfun/types';
import type { Collection, Db } from 'mongodb';

export interface ContractSubmissionStore {
  /** Return all submissions associated with a procurement project. */
  listByProject(projectId: string, contractYear?: number): Promise<ContractSubmission[]>;

  /**
   * Replace all stored submissions for a project with a complete snapshot.
   * An empty array means the project has no submissions.
   */
  replaceProjectSnapshot(
    projectId: string,
    contractYear: number,
    records: ContractSubmission[],
  ): Promise<void>;

  stageProjectSnapshot(
    projectId: string,
    contractYear: number,
    generation: string,
    records: ContractSubmission[],
  ): Promise<void>;

  discardStagedProjectSnapshot(
    projectId: string,
    contractYear: number,
    generation: string,
  ): Promise<void>;
}

interface ContractSubmissionDocument {
  merchant_name: string | null;
  seq_no: number | null;
  seq_no_desc: string | null;
  submit_price: number | null;
}

interface ContractSubmissionProjectDocument {
  _id: string;
  projectId: string;
  contractYear: number;
  submissions: ContractSubmissionDocument[];
  updated_at: string;
}

interface ContractSubmissionGenerationDocument extends ContractSubmissionProjectDocument {
  generation: string;
}

interface ContractEnrichmentPointerDocument {
  _id: string;
  project_id: string;
  contract_year: number;
  active_generation?: string | null;
}

function toDomain(
  projectId: string,
  contractYear: number,
  document: ContractSubmissionDocument,
): ContractSubmission {
  return {
    projectId,
    contractYear,
    merchantName: document.merchant_name,
    seqNo: document.seq_no,
    seqNoDesc: document.seq_no_desc,
    submitPrice: document.submit_price,
  };
}

function toDocument(record: ContractSubmission): ContractSubmissionDocument {
  return {
    merchant_name: record.merchantName,
    seq_no: record.seqNo,
    seq_no_desc: record.seqNoDesc,
    submit_price: record.submitPrice,
  };
}

export class ContractSubmissionRepository implements ContractSubmissionStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ContractSubmissionProjectDocument>> {
    return (await this.getDb()).collection<ContractSubmissionProjectDocument>(
      'contract_submissions',
    );
  }

  private async stagedRecords(): Promise<Collection<ContractSubmissionGenerationDocument>> {
    return (await this.getDb()).collection<ContractSubmissionGenerationDocument>(
      'contract_submission_staging',
    );
  }

  async listByProject(projectId: string, contractYear?: number): Promise<ContractSubmission[]> {
    const [active, legacy] = await Promise.all([
      (await this.getDb())
        .collection<ContractEnrichmentPointerDocument>('contract_enrichments')
        .find({
          project_id: projectId,
          active_generation: { $type: 'string' },
          ...(contractYear === undefined ? {} : { contract_year: contractYear }),
        })
        .toArray(),
      (await this.records())
        .find({ projectId, ...(contractYear === undefined ? {} : { contractYear }) })
        .toArray(),
    ]);

    const published = active.filter(
      (document): document is ContractEnrichmentPointerDocument & { active_generation: string } =>
        typeof document.active_generation === 'string',
    );
    const snapshots = published.length
      ? await (
          await this.stagedRecords()
        )
          .find({
            projectId,
            $or: published.map((document) => ({
              contractYear: document.contract_year,
              generation: document.active_generation,
            })),
          })
          .toArray()
      : [];
    const publishedYears = new Set(published.map((document) => document.contract_year));
    const documents = [
      ...snapshots,
      ...legacy.filter((document) => !publishedYears.has(document.contractYear)),
    ];

    return documents.flatMap((document) =>
      document.submissions.map((record) => toDomain(projectId, document.contractYear, record)),
    );
  }

  async replaceProjectSnapshot(
    projectId: string,
    contractYear: number,
    records: ContractSubmission[],
  ): Promise<void> {
    await (
      await this.records()
    ).updateOne(
      { _id: `${projectId}:${contractYear}` },
      {
        $set: {
          projectId,
          contractYear,
          submissions: records.map(toDocument),
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }

  async stageProjectSnapshot(
    projectId: string,
    contractYear: number,
    generation: string,
    records: ContractSubmission[],
  ): Promise<void> {
    const document: ContractSubmissionGenerationDocument = {
      _id: `${projectId}:${contractYear}:${generation}`,
      projectId,
      contractYear,
      generation,
      submissions: records.map(toDocument),
      updated_at: new Date().toISOString(),
    };
    await (
      await this.stagedRecords()
    ).replaceOne({ _id: document._id }, document, {
      upsert: true,
    });
  }

  async discardStagedProjectSnapshot(
    projectId: string,
    contractYear: number,
    generation: string,
  ): Promise<void> {
    await (
      await this.stagedRecords()
    ).deleteOne({
      _id: `${projectId}:${contractYear}:${generation}`,
    });
  }
}
