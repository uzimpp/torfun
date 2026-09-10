import { ObjectId, type Collection, type Db } from 'mongodb';
import type { Company } from '@torfun/types';

/**
 * Data access for the vendor's own record.
 *
 * This layer owns the only mapping between the stored document and the
 * `Company` defined in `@torfun/types`. Nothing above it handles an
 * `ObjectId`, and the Thai name rule is not enforced here — a route validates
 * a name a person typed, whereas a name already in Atlas (a free-text
 * `company_name` the migration lifted into a Company, say) must still read
 * back rather than crash the officer who owns it.
 */

/**
 * Persistence shape. snake_case matches the documents in Atlas; this type must
 * not escape the repository.
 */
interface CompanyDocument {
  _id: ObjectId;
  name_th: string;
  /** Optional and carries no uniqueness constraint — see ADR-0008. */
  tin: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewCompany {
  nameTh: string;
  tin: string | null;
}

export interface CompanyPatch {
  nameTh?: string;
  tin?: string | null;
}

function toDomain(document: CompanyDocument): Company {
  return {
    id: document._id.toString(),
    nameTh: document.name_th,
    tin: document.tin ?? null,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

/** Escapes a user's keystrokes so a typeahead cannot smuggle in a pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The slice of this repository the service layer needs, so a route test can
 * run against a store that really stores rather than against a database.
 */
export interface CompanyStore {
  findById(id: string): Promise<Company | null>;
  /** Case-insensitive substring over the Thai name, for the join typeahead. */
  search(query: string, limit: number): Promise<Company[]>;
  create(input: NewCompany): Promise<Company>;
  update(id: string, patch: CompanyPatch): Promise<Company | null>;
}

export class CompanyRepository implements CompanyStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<CompanyDocument>> {
    return (await this.getDb()).collection<CompanyDocument>('companies');
  }

  /** Idempotent; the typeahead's sort and lookup both read this index. */
  async ensureIndexes(): Promise<void> {
    await (await this.collection()).createIndexes([{ key: { name_th: 1 } }]);
  }

  async findById(id: string): Promise<Company | null> {
    // A malformed id is a miss, not a crash: the reference comes off a user
    // document that a migration or a hand edit could have left mangled.
    if (!ObjectId.isValid(id)) return null;
    const document = await (await this.collection()).findOne({ _id: new ObjectId(id) });
    return document ? toDomain(document) : null;
  }

  async search(query: string, limit: number): Promise<Company[]> {
    const documents = await (
      await this.collection()
    )
      .find({ name_th: { $regex: escapeRegex(query), $options: 'i' } })
      .sort({ name_th: 1 })
      .limit(limit)
      .toArray();
    return documents.map(toDomain);
  }

  async create(input: NewCompany): Promise<Company> {
    const now = new Date();
    const document = {
      name_th: input.nameTh,
      tin: input.tin,
      created_at: now,
      updated_at: now,
    };

    const result = await (await this.collection()).insertOne(document as CompanyDocument);
    return toDomain({ ...document, _id: result.insertedId } as CompanyDocument);
  }

  async update(id: string, patch: CompanyPatch): Promise<Company | null> {
    if (!ObjectId.isValid(id)) return null;

    const fields: Partial<CompanyDocument> = { updated_at: new Date() };
    if (patch.nameTh !== undefined) fields.name_th = patch.nameTh;
    if (patch.tin !== undefined) fields.tin = patch.tin;

    const document = await (
      await this.collection()
    ).findOneAndUpdate({ _id: new ObjectId(id) }, { $set: fields }, { returnDocument: 'after' });
    return document ? toDomain(document) : null;
  }
}
