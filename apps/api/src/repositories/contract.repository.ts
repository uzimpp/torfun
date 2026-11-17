import type { Contract } from '@torfun/types';
import type { Collection, Db } from 'mongodb';

export interface ContractStore {
  /** Return all contracts associated with a procurement project. */
  listByProject(projectId: string, contractYear?: number): Promise<Contract[]>;

  /** Return contracts in the currently published snapshot for one fiscal year. */
  listByYear(contractYear: number): Promise<Contract[]>;

  /**
   * Replace all stored contracts for a project with a complete snapshot.
   * An empty array means the project has no contracts.
   */
  replaceProjectSnapshot(
    projectId: string,
    contractYear: number,
    records: Contract[],
  ): Promise<void>;

  /** Write a complete fiscal-year snapshot under an unpublished generation. */
  stageYearSnapshot(contractYear: number, generation: string, records: Contract[]): Promise<void>;

  discardStagedYearSnapshot(contractYear: number, generation: string): Promise<void>;
}

interface ContractDocument {
  contract_no: string | null;
  winner_name: string | null;
  winner_tin: string | null;
  price_agree: number | null;
  contract_date: string | null;
  contract_finish_date: string | null;
  status: string | null;
}

interface ContractProjectDocument {
  _id: string;
  projectId: string;
  contractYear: number;
  contracts: ContractDocument[];
  updated_at: string;
}

interface ContractStagedProjectDocument extends ContractProjectDocument {
  generation: string;
}

interface ContractSyncPointerDocument {
  _id: number;
  active_generation?: string | null;
}

function toDomain(projectId: string, contractYear: number, document: ContractDocument): Contract {
  return {
    projectId,
    contractYear,
    contractNo: document.contract_no,
    winnerName: document.winner_name,
    winnerTin: document.winner_tin,
    priceAgree: document.price_agree,
    contractDate: document.contract_date,
    contractFinishDate: document.contract_finish_date,
    status: document.status,
  };
}

function toDocument(record: Contract): ContractDocument {
  return {
    contract_no: record.contractNo,
    winner_name: record.winnerName,
    winner_tin: record.winnerTin,
    price_agree: record.priceAgree,
    contract_date: record.contractDate,
    contract_finish_date: record.contractFinishDate,
    status: record.status,
  };
}

export class ContractRepository implements ContractStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async records(): Promise<Collection<ContractProjectDocument>> {
    return (await this.getDb()).collection<ContractProjectDocument>('contracts');
  }

  private async stagedRecords(): Promise<Collection<ContractStagedProjectDocument>> {
    return (await this.getDb()).collection<ContractStagedProjectDocument>(
      'contract_snapshot_staging',
    );
  }

  private async activeGenerations(): Promise<Map<number, string>> {
    const documents = await (
      await this.getDb()
    )
      .collection<ContractSyncPointerDocument>('contract_syncs')
      .find({ active_generation: { $type: 'string' } })
      .toArray();
    return new Map(
      documents.flatMap((document) =>
        document.active_generation ? [[document._id, document.active_generation] as const] : [],
      ),
    );
  }

  async listByProject(projectId: string, contractYear?: number): Promise<Contract[]> {
    const [active, legacy] = await Promise.all([
      this.activeGenerations(),
      (await this.records())
        .find({ projectId, ...(contractYear === undefined ? {} : { contractYear }) })
        .toArray(),
    ]);

    const years = [...active.keys()].filter(
      (year) => contractYear === undefined || year === contractYear,
    );
    const published = years.length
      ? await (
          await this.stagedRecords()
        )
          .find({
            projectId,
            $or: years.map((year) => ({
              contractYear: year,
              generation: active.get(year),
            })),
          })
          .toArray()
      : [];
    const publishedYears = new Set(years);
    const snapshots = [
      ...published,
      ...legacy.filter((document) => !publishedYears.has(document.contractYear)),
    ];

    return snapshots.flatMap((document) =>
      document.contracts.map((record) => toDomain(projectId, document.contractYear, record)),
    );
  }

  async listByYear(contractYear: number): Promise<Contract[]> {
    const active = (await this.activeGenerations()).get(contractYear);
    const documents = active
      ? await (await this.stagedRecords()).find({ contractYear, generation: active }).toArray()
      : await (await this.records()).find({ contractYear }).toArray();

    return documents.flatMap((document) =>
      document.contracts.map((record) => toDomain(document.projectId, contractYear, record)),
    );
  }

  async replaceProjectSnapshot(
    projectId: string,
    contractYear: number,
    records: Contract[],
  ): Promise<void> {
    await (
      await this.records()
    ).updateOne(
      { _id: `${projectId}:${contractYear}` },
      {
        $set: {
          projectId,
          contractYear,
          contracts: records.map(toDocument),
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }

  async stageYearSnapshot(
    contractYear: number,
    generation: string,
    records: Contract[],
  ): Promise<void> {
    const grouped = new Map<string, ContractDocument[]>();
    for (const record of records) {
      const contracts = grouped.get(record.projectId) ?? [];
      contracts.push(toDocument(record));
      grouped.set(record.projectId, contracts);
    }

    const collection = await this.stagedRecords();
    const operations = [...grouped].map(([projectId, contracts]) => ({
      updateOne: {
        filter: { _id: `${contractYear}:${generation}:${projectId}` },
        update: {
          $set: {
            projectId,
            contractYear,
            generation,
            contracts,
            updated_at: new Date().toISOString(),
          },
        },
        upsert: true,
      },
    }));

    for (let index = 0; index < operations.length; index += 500) {
      await collection.bulkWrite(operations.slice(index, index + 500), { ordered: true });
    }
  }

  async discardStagedYearSnapshot(contractYear: number, generation: string): Promise<void> {
    await (await this.stagedRecords()).deleteMany({ contractYear, generation });
  }
}
