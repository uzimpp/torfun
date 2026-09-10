import type { Company } from '@torfun/types';
import { ForbiddenError, NotFoundError } from '../core/errors';
import type { CompanyStore } from '../repositories/company.repository';
import type { UserStore } from '../repositories/user.repository';

/**
 * Creating, finding and joining the vendor's own record.
 *
 * Membership is claimed rather than granted (ADR-0008): a signed-in officer
 * picks a Company from a typeahead or creates one, and nothing verifies that
 * they belong to it. What this service does guarantee is that a caller only
 * ever acts on *their own* Company — every method takes the caller's user id
 * and resolves the Company from the stored account.
 *
 * Free of Fastify types by design, so the rules here are testable without a
 * server.
 */

export interface CompanyInput {
  nameTh: string;
  tin: string | null;
}

export interface CompanyPatchInput {
  nameTh?: string;
  tin?: string | null;
}

/** How many suggestions a typeahead keystroke is worth. */
const SEARCH_LIMIT = 10;

export class CompanyService {
  constructor(
    private readonly companies: CompanyStore,
    private readonly users: UserStore,
  ) {}

  /**
   * Companies whose Thai name contains what the officer has typed.
   *
   * An empty query matches nothing rather than everything: the endpoint is
   * behind the session, but there is no reason to hand out the whole vendor
   * list in exchange for a keystroke that says nothing.
   */
  async search(query: string): Promise<Company[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return this.companies.search(trimmed, SEARCH_LIMIT);
  }

  /** Creates a Company and joins the caller to it in one step. */
  async createAndJoin(userId: string, input: CompanyInput): Promise<Company> {
    await this.refuseAdmin(userId);
    const company = await this.companies.create(input);
    await this.users.setCompanyId(userId, company.id);
    return company;
  }

  /** The caller's own Company. A caller with none has nothing to show. */
  async mine(userId: string): Promise<Company> {
    const user = await this.users.findById(userId);
    if (!user?.companyId) throw new NotFoundError('No company for this account');

    const company = await this.companies.findById(user.companyId);
    // A dangling reference reads as "no company" rather than as a fault, so a
    // deleted Company sends the officer back to the page that creates one.
    if (!company) throw new NotFoundError('No company for this account');
    return company;
  }

  async updateMine(userId: string, patch: CompanyPatchInput): Promise<Company> {
    const current = await this.mine(userId);
    const updated = await this.companies.update(current.id, patch);
    if (!updated) throw new NotFoundError('No company for this account');
    return updated;
  }

  /**
   * Repoints the caller at an existing Company.
   *
   * Switching is allowed and deliberately cheap — a mistake on day one should
   * not need a developer. Experiences stay where they are: they belong to the
   * Company, not to the person leaving it (ADR-0007).
   */
  async join(userId: string, companyId: string): Promise<Company> {
    await this.refuseAdmin(userId);

    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundError('No such company');

    await this.users.setCompanyId(userId, company.id);
    return company;
  }

  /**
   * A Company belongs to Business Development Officers only (ADR-0011). A Site
   * Administrator runs Retrieval and manages accounts and has nothing to score
   * against; `requireCompany` on the web already exempts them, so an admin that
   * held a `companyId` would be a state no screen was built to render. The
   * check lives here rather than in the route because both entry points —
   * create-and-join and join — must pass through it.
   */
  private async refuseAdmin(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (user?.role === 'admin') {
      throw new ForbiddenError('A Site Administrator does not belong to a company');
    }
  }

  /**
   * The Company's own name, for `/api/auth/me`.
   *
   * The Company is the source of truth for its name (ADR-0007); this is what
   * lets the web app keep reading a `company_name` off the current user
   * without a user document carrying a second, divergent copy of it.
   */
  async nameFor(companyId: string | null): Promise<string | null> {
    if (!companyId) return null;
    return (await this.companies.findById(companyId))?.nameTh ?? null;
  }
}
