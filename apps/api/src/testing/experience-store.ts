import { ObjectId } from 'mongodb';
import type { Experience } from '@torfun/types';
import type {
  ExperiencePatch,
  ExperienceStore,
  NewExperience,
} from '../repositories/experience.repository';

/**
 * An in-memory `ExperienceStore`, scoped by company exactly as the repository
 * is. It stores whole months, which is what makes "two years round-trips as
 * two years" a real assertion rather than a restatement of the request body.
 */
export class InMemoryExperienceStore implements ExperienceStore {
  private readonly experiences = new Map<string, Experience>();

  async listByCompany(companyId: string): Promise<Experience[]> {
    return [...this.experiences.values()].filter(
      (experience) => experience.companyId === companyId,
    );
  }

  async findById(companyId: string, id: string): Promise<Experience | null> {
    const experience = this.experiences.get(id);
    return experience && experience.companyId === companyId ? experience : null;
  }

  async create(input: NewExperience): Promise<Experience> {
    const now = new Date();
    const experience: Experience = {
      id: new ObjectId().toString(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.experiences.set(experience.id, experience);
    return experience;
  }

  async update(companyId: string, id: string, patch: ExperiencePatch): Promise<Experience | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) return null;

    // Only the keys actually present move — the service builds a patch out of
    // what the request mentioned — so a PATCH that says nothing about a
    // duration leaves the stored one alone.
    const updated: Experience = { ...existing, ...patch, updatedAt: new Date() };
    this.experiences.set(id, updated);
    return updated;
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    if (!(await this.findById(companyId, id))) return false;
    return this.experiences.delete(id);
  }

  async countByClient(companyId: string, clientId: string): Promise<number> {
    return (await this.listByCompany(companyId)).filter(
      (experience) => experience.clientId === clientId,
    ).length;
  }
}
