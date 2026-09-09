import { ObjectId, type Collection, type Db } from 'mongodb';
import type { DurationUnit, Experience, TargetPlatform } from '@torfun/types';

/**
 * Data access for the work a Company has delivered.
 *
 * Scoped by Company on every read and every write, for the same reason
 * `client.repository.ts` is: an Experience is the vendor's own record of what
 * it has built, and it must never be addressable by anyone else.
 *
 * A duration arrives here already reduced to whole months, with the unit the
 * person chose stored beside it. Storage does no arithmetic — `toDurationMonths`
 * in `@torfun/types` is the only place the twelve lives (ADR-0009).
 */

/**
 * Persistence shape. snake_case matches the documents in Atlas; this type must
 * not escape the repository.
 */
interface ExperienceDocument {
  _id: ObjectId;
  company_id: string;
  client_id: string;
  project_name: string;
  description: string | null;
  tech_stack: string[];
  target_platforms: TargetPlatform[];
  /** Canonical length in whole months; null together with `duration_unit`. */
  duration_months: number | null;
  duration_unit: DurationUnit | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewExperience {
  companyId: string;
  clientId: string;
  projectName: string;
  description: string | null;
  techStack: string[];
  targetPlatforms: TargetPlatform[];
  durationMonths: number | null;
  durationUnit: DurationUnit | null;
}

export type ExperiencePatch = Partial<Omit<NewExperience, 'companyId'>>;

function toDomain(document: ExperienceDocument): Experience {
  return {
    id: document._id.toString(),
    companyId: document.company_id,
    clientId: document.client_id,
    projectName: document.project_name,
    description: document.description ?? null,
    techStack: document.tech_stack ?? [],
    targetPlatforms: document.target_platforms ?? [],
    durationMonths: document.duration_months ?? null,
    durationUnit: document.duration_unit ?? null,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
}

/** The slice of this repository the service layer needs. */
export interface ExperienceStore {
  listByCompany(companyId: string): Promise<Experience[]>;
  findById(companyId: string, id: string): Promise<Experience | null>;
  create(input: NewExperience): Promise<Experience>;
  update(companyId: string, id: string, patch: ExperiencePatch): Promise<Experience | null>;
  remove(companyId: string, id: string): Promise<boolean>;
  /** What makes deleting a Client with work behind it a 409 rather than a cascade. */
  countByClient(companyId: string, clientId: string): Promise<number>;
}

export class ExperienceRepository implements ExperienceStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async collection(): Promise<Collection<ExperienceDocument>> {
    return (await this.getDb()).collection<ExperienceDocument>('experiences');
  }

  /** Idempotent; both the list and the delete guard filter on these fields. */
  async ensureIndexes(): Promise<void> {
    await (
      await this.collection()
    ).createIndexes([{ key: { company_id: 1, client_id: 1 } }, { key: { company_id: 1 } }]);
  }

  async listByCompany(companyId: string): Promise<Experience[]> {
    const documents = await (
      await this.collection()
    )
      .find({ company_id: companyId })
      .sort({ created_at: -1 })
      .toArray();
    return documents.map(toDomain);
  }

  async findById(companyId: string, id: string): Promise<Experience | null> {
    if (!ObjectId.isValid(id)) return null;
    const document = await (
      await this.collection()
    ).findOne({ _id: new ObjectId(id), company_id: companyId });
    return document ? toDomain(document) : null;
  }

  async create(input: NewExperience): Promise<Experience> {
    const now = new Date();
    const document = {
      company_id: input.companyId,
      client_id: input.clientId,
      project_name: input.projectName,
      description: input.description,
      tech_stack: input.techStack,
      target_platforms: input.targetPlatforms,
      duration_months: input.durationMonths,
      duration_unit: input.durationUnit,
      created_at: now,
      updated_at: now,
    };

    const result = await (await this.collection()).insertOne(document as ExperienceDocument);
    return toDomain({ ...document, _id: result.insertedId } as ExperienceDocument);
  }

  async update(companyId: string, id: string, patch: ExperiencePatch): Promise<Experience | null> {
    if (!ObjectId.isValid(id)) return null;

    const fields: Partial<ExperienceDocument> = { updated_at: new Date() };
    if (patch.clientId !== undefined) fields.client_id = patch.clientId;
    if (patch.projectName !== undefined) fields.project_name = patch.projectName;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.techStack !== undefined) fields.tech_stack = patch.techStack;
    if (patch.targetPlatforms !== undefined) fields.target_platforms = patch.targetPlatforms;
    // The pair moves together or not at all, so that a stored length can never
    // disagree with the unit it is displayed in.
    if (patch.durationMonths !== undefined) fields.duration_months = patch.durationMonths;
    if (patch.durationUnit !== undefined) fields.duration_unit = patch.durationUnit;

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

  async countByClient(companyId: string, clientId: string): Promise<number> {
    return (await this.collection()).countDocuments({
      company_id: companyId,
      client_id: clientId,
    });
  }
}
