import type { Client, ClientKind } from '@torfun/types';
import { ConflictError, NotFoundError } from '../core/errors';
import type { ClientPatch, ClientStore } from '../repositories/client.repository';
import type { ExperienceStore } from '../repositories/experience.repository';
import type { AgencyNameSource } from '../repositories/procurement.repository';
import type { UserStore } from '../repositories/user.repository';
import { optionalCompanyId, requireCompanyId } from './company-scope';

/**
 * The organisations a Company has delivered work for.
 *
 * Every method resolves the Company from the caller's own account before it
 * touches storage, so there is no path by which one vendor reads or writes
 * another's customer list.
 */

export interface ClientInput {
  name: string;
  kind: ClientKind;
}

/** How many suggestions a typeahead keystroke is worth. */
const SUGGESTION_LIMIT = 10;

export class ClientService {
  constructor(
    private readonly clients: ClientStore,
    private readonly experiences: ExperienceStore,
    private readonly users: UserStore,
    /** Public upstream data, used only for government suggestions. */
    private readonly agencyNames: AgencyNameSource,
  ) {}

  async list(userId: string): Promise<Client[]> {
    const companyId = await optionalCompanyId(this.users, userId);
    return companyId ? this.clients.listByCompany(companyId) : [];
  }

  async create(userId: string, input: ClientInput): Promise<Client> {
    const companyId = await requireCompanyId(this.users, userId);
    return this.clients.create({ companyId, ...input });
  }

  async update(userId: string, id: string, patch: ClientPatch): Promise<Client> {
    const companyId = await requireCompanyId(this.users, userId);
    const updated = await this.clients.update(companyId, id, patch);
    // Another company's client is indistinguishable from one that never
    // existed, which is the point: a 403 would confirm the id is real.
    if (!updated) throw new NotFoundError('No such client');
    return updated;
  }

  /**
   * Deletes a Client, unless work is still recorded against it.
   *
   * A cascade would silently destroy the record this whole feature exists to
   * build, so the answer is a refusal the officer can act on: unhook or delete
   * the Experiences first.
   */
  async remove(userId: string, id: string): Promise<void> {
    const companyId = await requireCompanyId(this.users, userId);

    const client = await this.clients.findById(companyId, id);
    if (!client) throw new NotFoundError('No such client');

    const recorded = await this.experiences.countByClient(companyId, id);
    if (recorded > 0) {
      throw new ConflictError(
        `This client still has ${recorded} recorded ${recorded === 1 ? 'project' : 'projects'}`,
      );
    }

    await this.clients.remove(companyId, id);
  }

  /**
   * Names to offer while an officer types a client.
   *
   * Government names come from the agencies this system has already ingested,
   * so a vendor's spelling matches what the tenders say — public data, and the
   * one suggestion a caller without a Company can still use. Private names
   * come only from the caller's own Company, because a customer list is not
   * something to publish to other vendors.
   */
  async suggestions(userId: string, kind: ClientKind, query: string): Promise<string[]> {
    const trimmed = query.trim();

    if (kind === 'government') {
      const agencies = await this.agencyNames.agencies();
      const matching = trimmed
        ? agencies.filter((name) => name.toLowerCase().includes(trimmed.toLowerCase()))
        : agencies;
      return matching.slice(0, SUGGESTION_LIMIT);
    }

    const companyId = await optionalCompanyId(this.users, userId);
    if (!companyId) return [];
    return this.clients.suggestNames(companyId, trimmed, SUGGESTION_LIMIT);
  }
}
