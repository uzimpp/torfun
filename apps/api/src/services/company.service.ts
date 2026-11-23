import type { Company } from '@torfun/types';
import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors';
import type { CompanyStore } from '../repositories/company.repository';
import type { UserStore } from '../repositories/user.repository';
import {
  isManagerOf,
  SITE_ADMIN_HOLDS_NO_COMPANY,
  type CompanyMembershipService,
} from './company-membership.service';

/**
 * Creating, finding and correcting the vendor's own record.
 *
 * Joining an existing Company is a request a Company Manager approves; that
 * lives in `CompanyMembershipService`. Creating one makes the creator its first
 * manager. A caller only ever acts on *their own* Company — every method takes
 * the caller's user id and resolves the Company from the stored account.
 *
 * Free of Fastify types by design, so the rules here are testable without a
 * server.
 */

export interface CompanyInput {
  nameTh: string;
  tin: string;
}

export interface CompanyPatchInput {
  nameTh?: string;
  tin?: string;
}

/** Said when a TIN is already registered; the way forward is to join that Company. */
export const TIN_TAKEN =
  'A company with this TIN already exists. Search for it and ask to join instead.';

/** How many suggestions a typeahead keystroke is worth. */
const SEARCH_LIMIT = 10;

export class CompanyService {
  constructor(
    private readonly companies: CompanyStore,
    private readonly users: UserStore,
    private readonly membership: CompanyMembershipService,
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

  /** Creates a Company, joins the caller to it and makes them its manager. */
  async createAndJoin(userId: string, input: CompanyInput): Promise<Company> {
    const user = await this.refuseAdmin(userId);
    await this.refuseTakenTin(input.tin);
    // A manager may not walk away from colleagues who still need one, and
    // keeps no say over the Company they leave.
    const restore = await this.membership.stepDownToLeave(user);
    try {
      // The unique index settles a race the check above cannot; the store throws
      // `ConflictError` for it, so the caller sees the same answer either way.
      const company = await this.companies.create({ ...input, managerIds: [userId] });
      // Refused if the caller was made a Site Administrator since the check
      // above. The new Company is left with no members; its manager id counts
      // for nothing, because `isManagerOf` also needs the membership.
      if (!(await this.users.setCompanyId(userId, company.id))) {
        throw new ForbiddenError(SITE_ADMIN_HOLDS_NO_COMPANY);
      }
      return company;
    } catch (error) {
      await restore();
      throw error;
    }
  }

  /** The caller's own Company. A caller with none has nothing to show. */
  async mine(userId: string): Promise<{ company: Company; isManager: boolean }> {
    const user = await this.users.findById(userId);
    if (!user?.companyId) throw new NotFoundError('No company for this account');

    const company = await this.companies.findById(user.companyId);
    // A dangling reference reads as "no company" rather than as a fault, so a
    // deleted Company sends the officer back to the page that creates one.
    if (!company) throw new NotFoundError('No company for this account');
    return { company, isManager: isManagerOf(user, company) };
  }

  /** Renaming the Company or correcting its TIN is a manager's call. */
  async updateMine(userId: string, patch: CompanyPatchInput): Promise<Company> {
    const { company, isManager } = await this.mine(userId);
    if (!isManager) throw new ForbiddenError('Only a manager of this company can do that');
    if (patch.tin !== undefined) await this.refuseTakenTin(patch.tin, company.id);
    const updated = await this.companies.update(company.id, patch);
    if (!updated) throw new NotFoundError('No company for this account');
    return updated;
  }

  /** Refuses a TIN another Company already holds. `ownId` is the Company being edited. */
  private async refuseTakenTin(tin: string, ownId?: string): Promise<void> {
    const holder = await this.companies.findByTin(tin);
    if (holder && holder.id !== ownId) throw new ConflictError(TIN_TAKEN);
  }

  /**
   * A Company belongs to Business Development Officers only (ADR-0011). A Site
   * Administrator runs Retrieval and manages accounts and has nothing to score
   * against; `requireCompany` on the web already exempts them, so an admin that
   * held a `companyId` would be a state no screen was built to render. The
   * check lives in the service rather than the route; joining has the same one
   * in `CompanyMembershipService`.
   */
  private async refuseAdmin(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('No such account');
    if (user.role === 'admin') {
      throw new ForbiddenError(SITE_ADMIN_HOLDS_NO_COMPANY);
    }
    return user;
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
