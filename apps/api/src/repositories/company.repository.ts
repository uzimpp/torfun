import { ObjectId, type Collection, type Db } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { ConflictError } from '../core/errors';
import type { Company, CompanyQualifications, CompanyQualificationsRecord } from '@torfun/types';
import { escapeRegex } from '../core/regex';

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
interface QualificationsDocument {
  revision: string;
  registered_capital_thb: number | null;
  /** Absent on documents written before the price rule (FR-29); read as null. */
  bid_budget_min_thb?: number | null;
  bid_budget_max_thb?: number | null;
  certificates: { name: string; standard: string; issuer: string; valid_until: string }[];
  personnel: {
    role: string;
    years_of_experience: number | null;
    degree: string | null;
    certificates: string[] | null;
  }[];
}

interface CompanyDocument {
  qualifications?: QualificationsDocument;
  _id: ObjectId;
  name_th: string;
  /** Unique among Companies that have one (partial index); null on pre-rule documents. */
  tin: string | null;
  /** Absent on Companies created before managers existed; see the 2026-11 migration. */
  manager_ids?: string[];
  auto_approve_domain?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewCompany {
  nameTh: string;
  /** The API requires one; null stays storable for fixtures and pre-rule data. */
  tin: string | null;
  /** The creator, so a new Company is never without someone to approve joins. */
  managerIds?: string[];
}

export interface CompanyPatch {
  nameTh?: string;
  tin?: string;
  autoApproveDomain?: string | null;
}

function toDomain(document: CompanyDocument): Company {
  return {
    id: document._id.toString(),
    nameTh: document.name_th,
    tin: document.tin ?? null,
    managerIds: document.manager_ids ?? [],
    autoApproveDomain: document.auto_approve_domain ?? null,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

/** A duplicate-key error from the TIN index, as the answer the service gives. */
function asTinConflict(error: unknown): unknown {
  return (error as { code?: number }).code === 11000
    ? new ConflictError(
        'A company with this TIN already exists. Search for it and ask to join instead.',
      )
    : error;
}

function qualificationsOf(
  document: Pick<CompanyDocument, '_id' | 'qualifications'>,
): CompanyQualificationsRecord {
  const stored = document.qualifications;
  return {
    companyId: document._id.toString(),
    revision: stored?.revision ?? null,
    registeredCapitalThb: stored?.registered_capital_thb ?? null,
    bidBudgetMinThb: stored?.bid_budget_min_thb ?? null,
    bidBudgetMaxThb: stored?.bid_budget_max_thb ?? null,
    certificates:
      stored?.certificates.map(({ valid_until, ...item }) => ({
        ...item,
        validUntil: valid_until,
      })) ?? [],
    personnel:
      stored?.personnel.map(({ years_of_experience, ...item }) => ({
        ...item,
        yearsOfExperience: years_of_experience,
      })) ?? [],
  };
}

/** Escapes a user's keystrokes so a typeahead cannot smuggle in a pattern. */

/**
 * The slice of this repository the service layer needs, so a route test can
 * run against a store that really stores rather than against a database.
 */
export interface CompanyStore {
  findQualifications(id: string): Promise<CompanyQualificationsRecord | null>;
  replaceQualifications(
    id: string,
    revision: string | null,
    input: CompanyQualifications,
  ): Promise<CompanyQualificationsRecord | null>;
  findById(id: string): Promise<Company | null>;
  /** The Company registered under this TIN, if any. */
  findByTin(tin: string): Promise<Company | null>;
  /** Case-insensitive substring over the Thai name, for the join typeahead. */
  search(query: string, limit: number): Promise<Company[]>;
  create(input: NewCompany): Promise<Company>;
  update(id: string, patch: CompanyPatch): Promise<Company | null>;
  /** Adds or drops one manager id; a no-op if it is already so. */
  setManager(id: string, userId: string, isManager: boolean): Promise<Company | null>;
  /**
   * Drops one manager id and says whether it did. With `keepOne`, only while
   * another id remains, decided in the same write: two managers stepping down
   * at once cannot both succeed and leave the Company with none.
   */
  removeManager(id: string, userId: string, options: { keepOne: boolean }): Promise<boolean>;
}

export class CompanyRepository implements CompanyStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<CompanyDocument>> {
    return (await this.getDb()).collection<CompanyDocument>('companies');
  }

  /** Idempotent; the typeahead's sort and lookup both read this index. */
  async ensureIndexes(): Promise<void> {
    const collection = await this.collection();
    await collection.createIndexes([{ key: { name_th: 1 } }]);
    try {
      await collection.createIndex(
        { tin: 1 },
        { unique: true, partialFilterExpression: { tin: { $type: 'string' } }, name: 'tin_unique' },
      );
    } catch (error) {
      // Duplicates created before the rule make the build fail (E11000). Do not
      // stop the API for it: the service still refuses new duplicates, and
      // docs/migrations/2026-11-company-unique-tin.js lists the ones to merge.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  async findById(id: string): Promise<Company | null> {
    // A malformed id is a miss, not a crash: the reference comes off a user
    // document that a migration or a hand edit could have left mangled.
    if (!ObjectId.isValid(id)) return null;
    const document = await (await this.collection()).findOne({ _id: new ObjectId(id) });
    return document ? toDomain(document) : null;
  }

  async findByTin(tin: string): Promise<Company | null> {
    const document = await (await this.collection()).findOne({ tin });
    return document ? toDomain(document) : null;
  }

  async findQualifications(id: string): Promise<CompanyQualificationsRecord | null> {
    if (!ObjectId.isValid(id)) return null;
    const document = await (
      await this.collection()
    ).findOne({ _id: new ObjectId(id) }, { projection: { qualifications: 1 } });
    return document ? qualificationsOf(document) : null;
  }

  async replaceQualifications(
    id: string,
    revision: string | null,
    input: CompanyQualifications,
  ): Promise<CompanyQualificationsRecord | null> {
    if (!ObjectId.isValid(id)) return null;
    const qualifications: QualificationsDocument = {
      revision: randomUUID(),
      registered_capital_thb: input.registeredCapitalThb,
      bid_budget_min_thb: input.bidBudgetMinThb,
      bid_budget_max_thb: input.bidBudgetMaxThb,
      certificates: input.certificates.map(({ validUntil, ...item }) => ({
        ...item,
        valid_until: validUntil,
      })),
      personnel: input.personnel.map(({ yearsOfExperience, ...item }) => ({
        ...item,
        years_of_experience: yearsOfExperience,
      })),
    };
    const document = await (
      await this.collection()
    ).findOneAndUpdate(
      { _id: new ObjectId(id), 'qualifications.revision': revision },
      { $set: { qualifications, updated_at: new Date() } },
      { projection: { qualifications: 1 }, returnDocument: 'after' },
    );
    return document ? qualificationsOf(document) : null;
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
      manager_ids: input.managerIds ?? [],
      auto_approve_domain: null,
      created_at: now,
      updated_at: now,
    };

    try {
      const result = await (await this.collection()).insertOne(document as CompanyDocument);
      return toDomain({ ...document, _id: result.insertedId } as CompanyDocument);
    } catch (error) {
      throw asTinConflict(error);
    }
  }

  async update(id: string, patch: CompanyPatch): Promise<Company | null> {
    if (!ObjectId.isValid(id)) return null;

    const fields: Partial<CompanyDocument> = { updated_at: new Date() };
    if (patch.nameTh !== undefined) fields.name_th = patch.nameTh;
    if (patch.tin !== undefined) fields.tin = patch.tin;
    if (patch.autoApproveDomain !== undefined) fields.auto_approve_domain = patch.autoApproveDomain;

    try {
      const document = await (
        await this.collection()
      ).findOneAndUpdate({ _id: new ObjectId(id) }, { $set: fields }, { returnDocument: 'after' });
      return document ? toDomain(document) : null;
    } catch (error) {
      throw asTinConflict(error);
    }
  }

  async setManager(id: string, userId: string, isManager: boolean): Promise<Company | null> {
    if (!ObjectId.isValid(id)) return null;
    const change = isManager
      ? { $addToSet: { manager_ids: userId } }
      : { $pull: { manager_ids: userId } };
    const document = await (
      await this.collection()
    ).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { ...change, $set: { updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    return document ? toDomain(document) : null;
  }

  async removeManager(
    id: string,
    userId: string,
    { keepOne }: { keepOne: boolean },
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await (
      await this.collection()
    ).updateOne(
      {
        _id: new ObjectId(id),
        manager_ids: userId,
        // A second element exists: someone else is still a manager after the pull.
        ...(keepOne ? { 'manager_ids.1': { $exists: true } } : {}),
      },
      { $pull: { manager_ids: userId }, $set: { updated_at: new Date() } },
    );
    return result.modifiedCount === 1;
  }
}
