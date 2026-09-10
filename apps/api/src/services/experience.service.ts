import {
  toDurationMonths,
  type DurationUnit,
  type Experience,
  type TargetPlatform,
} from '@torfun/types';
import { NotFoundError } from '../core/errors';
import type { ClientStore } from '../repositories/client.repository';
import type { ExperiencePatch, ExperienceStore } from '../repositories/experience.repository';
import type { UserStore } from '../repositories/user.repository';
import { optionalCompanyId, requireCompanyId } from './company-scope';

/**
 * The work a Company has delivered — the vendor half of a future match.
 *
 * Only a Client and a project name are required. Everything else is optional
 * so that an officer with thirty projects to enter can get them down quickly,
 * at the known cost that a record without a tech stack or a platform cannot
 * contribute to those parts of a later score.
 *
 * This is where a duration becomes canonical: the person picks months or
 * years, and `toDurationMonths` — the only place the twelve lives — reduces it
 * to whole months with the chosen unit stored beside it, so two years reads
 * back as two years rather than as twenty four months (ADR-0009).
 */

/** A length as a person entered it, before it is reduced to months. */
export interface DurationInput {
  value: number;
  unit: DurationUnit;
}

export interface ExperienceInput {
  clientId: string;
  projectName: string;
  description: string | null;
  techStack: string[];
  targetPlatforms: TargetPlatform[];
  duration: DurationInput | null;
}

export type ExperienceUpdate = Partial<ExperienceInput>;

/** Splits a person's answer into the pair that gets stored. */
function toStoredDuration(duration: DurationInput | null): {
  durationMonths: number | null;
  durationUnit: DurationUnit | null;
} {
  if (!duration) return { durationMonths: null, durationUnit: null };
  return {
    durationMonths: toDurationMonths(duration.value, duration.unit),
    durationUnit: duration.unit,
  };
}

export class ExperienceService {
  constructor(
    private readonly experiences: ExperienceStore,
    private readonly clients: ClientStore,
    private readonly users: UserStore,
  ) {}

  async list(userId: string): Promise<Experience[]> {
    const companyId = await optionalCompanyId(this.users, userId);
    return companyId ? this.experiences.listByCompany(companyId) : [];
  }

  async create(userId: string, input: ExperienceInput): Promise<Experience> {
    const companyId = await requireCompanyId(this.users, userId);
    await this.requireOwnClient(companyId, input.clientId);

    return this.experiences.create({
      companyId,
      clientId: input.clientId,
      projectName: input.projectName,
      description: input.description,
      techStack: input.techStack,
      targetPlatforms: input.targetPlatforms,
      ...toStoredDuration(input.duration),
    });
  }

  async update(userId: string, id: string, update: ExperienceUpdate): Promise<Experience> {
    const companyId = await requireCompanyId(this.users, userId);
    if (update.clientId !== undefined) await this.requireOwnClient(companyId, update.clientId);

    const patch: ExperiencePatch = {};
    if (update.clientId !== undefined) patch.clientId = update.clientId;
    if (update.projectName !== undefined) patch.projectName = update.projectName;
    if (update.description !== undefined) patch.description = update.description;
    if (update.techStack !== undefined) patch.techStack = update.techStack;
    if (update.targetPlatforms !== undefined) patch.targetPlatforms = update.targetPlatforms;
    if (update.duration !== undefined) Object.assign(patch, toStoredDuration(update.duration));

    const updated = await this.experiences.update(companyId, id, patch);
    if (!updated) throw new NotFoundError('No such experience');
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    const companyId = await requireCompanyId(this.users, userId);
    if (!(await this.experiences.remove(companyId, id))) {
      throw new NotFoundError('No such experience');
    }
  }

  /**
   * A piece of work can only hang off a Client the caller's own Company owns.
   *
   * Without this an experience body could name any client id and quietly
   * attach the vendor's record to a stranger's customer.
   */
  private async requireOwnClient(companyId: string, clientId: string): Promise<void> {
    if (!(await this.clients.findById(companyId, clientId))) {
      throw new NotFoundError('No such client');
    }
  }
}
