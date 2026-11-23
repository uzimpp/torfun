import type { Collection, Db } from 'mongodb';
import type { SourceAgency } from '@torfun/types';
import { INGESTION_META_COLLECTION } from './ingestion-meta';

/** What is stored: the agencies, and who last changed the list and when. */
export interface StoredSourceRegistry {
  agencies: SourceAgency[];
  updatedAt: string;
  updatedBy: string;
}

export interface SourceRegistryStore {
  /** Null until an administrator first saves: the caller then applies its default. */
  get(): Promise<StoredSourceRegistry | null>;
  /** Replaces the whole list. */
  save(agencies: SourceAgency[], updatedBy: string, at: string): Promise<StoredSourceRegistry>;
}

interface SourceRegistryDocument {
  _id: string;
  agencies: Array<{ dept_id: string; dept_name: string }>;
  updated_at: string;
  updated_by: string;
}

const SOURCE_REGISTRY_ID = 'source_registry';

/**
 * One document in the ingestion meta collection, like the Schedule. Absent until
 * an administrator changes the registry, so deploying this needs no migration
 * and changes nothing about what a Run reads.
 */
export class SourceRegistryRepository implements SourceRegistryStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async documents(): Promise<Collection<SourceRegistryDocument>> {
    return (await this.getDb()).collection<SourceRegistryDocument>(INGESTION_META_COLLECTION);
  }

  async get(): Promise<StoredSourceRegistry | null> {
    const document = await (await this.documents()).findOne({ _id: SOURCE_REGISTRY_ID });
    if (!document) return null;
    return {
      agencies: document.agencies.map((agency) => ({
        deptId: agency.dept_id,
        deptName: agency.dept_name,
      })),
      updatedAt: document.updated_at,
      updatedBy: document.updated_by,
    };
  }

  async save(
    agencies: SourceAgency[],
    updatedBy: string,
    at: string,
  ): Promise<StoredSourceRegistry> {
    await (
      await this.documents()
    ).updateOne(
      { _id: SOURCE_REGISTRY_ID },
      {
        $set: {
          agencies: agencies.map((agency) => ({
            dept_id: agency.deptId,
            dept_name: agency.deptName,
          })),
          updated_at: at,
          updated_by: updatedBy,
        },
      },
      { upsert: true },
    );
    return { agencies, updatedAt: at, updatedBy };
  }
}
