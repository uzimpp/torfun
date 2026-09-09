import { ObjectId, type Collection, type Db } from 'mongodb';
import type { Client, ClientKind } from '@torfun/types';

/**
 * Data access for the organisations a Company has delivered work for.
 *
 * Every method takes the caller's `companyId` and puts it in the filter, on
 * reads and on writes alike. That is the isolation rule from ADR-0008 made
 * structural: there is no method here that can reach a Client without naming
 * the Company it belongs to, so a service cannot forget the scope and a
 * caller can never address another vendor's customer list.
 */

/**
 * Persistence shape. snake_case matches the documents in Atlas; this type must
 * not escape the repository.
 *
 * `company_id` is stored as the string form of the Company's id — the same
 * value the API hands out — so the reference reads the same on both sides of
 * this layer and nothing above ever sees an `ObjectId`.
 */
interface ClientDocument {
  _id: ObjectId;
  company_id: string;
  name: string;
  kind: ClientKind;
  created_at: Date;
  updated_at: Date;
}

export interface NewClient {
  companyId: string;
  name: string;
  kind: ClientKind;
}

export interface ClientPatch {
  name?: string;
  kind?: ClientKind;
}

function toDomain(document: ClientDocument): Client {
  return {
    id: document._id.toString(),
    companyId: document.company_id,
    name: document.name,
    kind: document.kind,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The slice of this repository the service layer needs. */
export interface ClientStore {
  listByCompany(companyId: string): Promise<Client[]>;
  findById(companyId: string, id: string): Promise<Client | null>;
  create(input: NewClient): Promise<Client>;
  update(companyId: string, id: string, patch: ClientPatch): Promise<Client | null>;
  remove(companyId: string, id: string): Promise<boolean>;
  /** Distinct names already recorded by this Company, for the typeahead. */
  suggestNames(companyId: string, query: string, limit: number): Promise<string[]>;
}

export class ClientRepository implements ClientStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<ClientDocument>> {
    return (await this.getDb()).collection<ClientDocument>('clients');
  }

  /** Idempotent; every query in this file starts with `company_id`. */
  async ensureIndexes(): Promise<void> {
    await (await this.collection()).createIndexes([{ key: { company_id: 1, name: 1 } }]);
  }

  async listByCompany(companyId: string): Promise<Client[]> {
    const documents = await (
      await this.collection()
    )
      .find({ company_id: companyId })
      .sort({ name: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async findById(companyId: string, id: string): Promise<Client | null> {
    // A malformed id is a miss rather than a crash, and it stays scoped: an id
    // belonging to another Company reads exactly like one that never existed.
    if (!ObjectId.isValid(id)) return null;
    const document = await (
      await this.collection()
    ).findOne({ _id: new ObjectId(id), company_id: companyId });
    return document ? toDomain(document) : null;
  }

  async create(input: NewClient): Promise<Client> {
    const now = new Date();
    const document = {
      company_id: input.companyId,
      name: input.name,
      kind: input.kind,
      created_at: now,
      updated_at: now,
    };

    const result = await (await this.collection()).insertOne(document as ClientDocument);
    return toDomain({ ...document, _id: result.insertedId } as ClientDocument);
  }

  async update(companyId: string, id: string, patch: ClientPatch): Promise<Client | null> {
    if (!ObjectId.isValid(id)) return null;

    const fields: Partial<ClientDocument> = { updated_at: new Date() };
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.kind !== undefined) fields.kind = patch.kind;

    const document = await (
      await this.collection()
    ).findOneAndUpdate(
      { _id: new ObjectId(id), company_id: companyId },
      { $set: fields },
      { returnDocument: 'after' },
    );
    return document ? toDomain(document) : null;
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await (
      await this.collection()
    ).deleteOne({ _id: new ObjectId(id), company_id: companyId });
    return result.deletedCount === 1;
  }

  async suggestNames(companyId: string, query: string, limit: number): Promise<string[]> {
    const documents = await (
      await this.collection()
    )
      .find({ company_id: companyId, name: { $regex: escapeRegex(query), $options: 'i' } })
      .sort({ name: 1 })
      .limit(limit)
      .toArray();
    return [...new Set(documents.map((document) => document.name))];
  }
}
