import { emailDomainOf, type Company, type JoinOutcome, type User } from '@torfun/types';
import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors';
import type { CompanyStore } from '../repositories/company.repository';
import type { UserStore } from '../repositories/user.repository';

/**
 * Who belongs to a Company, and who decides that.
 *
 * Joining is a request that a Company Manager answers. The black-box pentest
 * (docs/pentest, finding P-1, issue #200) showed what open joining cost:
 * anyone who signed up could find a Company by name, join it in one call, and
 * read its registered capital, certificates, past contracts and clients.
 *
 * - The officer who creates a Company manages it. Managers can promote other
 *   members, so the role is not tied to one person.
 * - A manager may turn on automatic approval for one email domain. It applies
 *   only to an account whose email is at exactly that domain, and the manager's
 *   own email must be there too, so nobody can claim a domain they are not at.
 *   Emails are set only by Google sign-in, which requires `email_verified`
 *   (#197), so a typed address can never match.
 * - A request grants nothing until it is approved: every company-scoped read
 *   keys on `companyId`, which only an approval (or creating a Company) sets.
 * - A Company keeps at least one manager while it has members, so nobody is
 *   left with requests no one can answer. If that happens anyway (a Company
 *   from before managers existed), a Site Administrator assigns one. Stepping
 *   down is a conditional write in the store, so two managers doing it at
 *   once cannot both succeed.
 * - Whoever leaves a Company, by any route, leaves its `managerIds` too, so
 *   rejoining later never brings the old rights back.
 *
 * Free of Fastify types, like every service.
 */

export const SITE_ADMIN_HOLDS_NO_COMPANY = 'A Site Administrator does not belong to a company';

export interface CompanyMember {
  user: User;
  isManager: boolean;
}

export interface JoinResult {
  outcome: JoinOutcome;
  company: Company;
}

/**
 * Whether this account manages this Company. An id in `managerIds` counts only
 * while the account still belongs to the Company, so a manager who moved on
 * keeps no say over the one they left.
 */
export function isManagerOf(user: Pick<User, 'id' | 'companyId'>, company: Company): boolean {
  return user.companyId === company.id && company.managerIds.includes(user.id);
}

export class CompanyMembershipService {
  constructor(
    private readonly companies: CompanyStore,
    private readonly users: UserStore,
  ) {}

  /**
   * Asks to join a Company. Joins at once if the Company approves the caller's
   * email domain automatically; otherwise files a request and answers
   * `pending`. Asking again, for any Company, replaces the earlier request.
   */
  async requestToJoin(userId: string, companyId: string): Promise<JoinResult> {
    const user = await this.officer(userId);
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundError('No such company');
    if (user.companyId === company.id) return { outcome: 'joined', company };

    await this.assertCanLeave(user);

    // `email` is set only by a Google sign-in that passed `email_verified`, so
    // an unverified or typed address never reaches this comparison.
    const domain = emailDomainOf(user.email);
    if (company.autoApproveDomain !== null && domain === company.autoApproveDomain) {
      const restore = await this.stepDownToLeave(user);
      // Conditional on the account still being an officer, so a promotion to
      // Site Administrator that lands after the read above keeps them out.
      if (!(await this.users.setCompanyId(user.id, company.id))) {
        await restore();
        throw new ForbiddenError(SITE_ADMIN_HOLDS_NO_COMPANY);
      }
      return { outcome: 'joined', company };
    }

    if (!(await this.users.setJoinRequest(user.id, company.id))) {
      throw new ForbiddenError(SITE_ADMIN_HOLDS_NO_COMPANY);
    }
    return { outcome: 'pending', company };
  }

  /** The caller's unanswered request, if any. */
  async pendingRequest(userId: string): Promise<{ company: Company; requestedAt: Date } | null> {
    const request = (await this.users.findById(userId))?.joinRequest;
    if (!request) return null;
    const company = await this.companies.findById(request.companyId);
    return company ? { company, requestedAt: request.requestedAt } : null;
  }

  async withdrawRequest(userId: string): Promise<void> {
    await this.users.setJoinRequest(userId, null);
  }

  /** Everyone in the caller's Company. Any member may see who their colleagues are. */
  async members(userId: string): Promise<CompanyMember[]> {
    const { company } = await this.membership(userId);
    const members = await this.users.listByCompany(company.id);
    return members.map((user) => ({ user, isManager: isManagerOf(user, company) }));
  }

  /** Requests waiting on the caller's Company. Managers only. */
  async joinRequests(managerId: string): Promise<User[]> {
    const { company } = await this.manager(managerId);
    return this.users.listJoinRequests(company.id);
  }

  async approve(
    managerId: string,
    applicantId: string,
  ): Promise<{ company: Company; applicant: User }> {
    const { company } = await this.manager(managerId);
    const applicant = await this.applicant(company, applicantId);
    const restore = await this.stepDownToLeave(applicant);
    // Conditional on the request still being on file and the applicant still
    // being an officer, so a request withdrawn or replaced a moment ago cannot
    // be approved into the wrong Company, nor one whose owner was made a Site
    // Administrator approved into any.
    if (!(await this.users.acceptJoinRequest(applicant.id, company.id))) {
      await restore();
      throw new NotFoundError('No such join request');
    }
    return { company, applicant };
  }

  async reject(
    managerId: string,
    applicantId: string,
  ): Promise<{ company: Company; applicant: User }> {
    const { company } = await this.manager(managerId);
    const applicant = await this.applicant(company, applicantId);
    await this.users.setJoinRequest(applicant.id, null);
    return { company, applicant };
  }

  /**
   * Turns automatic approval on for `domain`, or off with null. The domain has
   * already passed `AutoApproveDomain` (no public mail providers); here the
   * manager must also hold a verified address at it.
   */
  async setAutoApproveDomain(managerId: string, domain: string | null): Promise<Company> {
    const { user, company } = await this.manager(managerId);
    if (domain !== null && emailDomainOf(user.email) !== domain) {
      throw new ForbiddenError(
        'Automatic approval needs your own Google sign-in email to be at that domain',
      );
    }
    const updated = await this.companies.update(company.id, { autoApproveDomain: domain });
    if (!updated) throw new NotFoundError('No company for this account');
    return updated;
  }

  /** Promotes a member to manager, or steps one down. */
  async setManager(
    managerId: string,
    memberId: string,
    isManager: boolean,
  ): Promise<{ company: Company; member: User }> {
    const { company } = await this.manager(managerId);
    const member = await this.member(company, memberId);
    if (isManager) await this.companies.setManager(company.id, member.id, true);
    else await this.demote(company.id, member.id);
    const updated = await this.companies.findById(company.id);
    if (!updated) throw new NotFoundError('No company for this account');
    return { company: updated, member };
  }

  /** Takes someone out of the Company. Their recorded work stays with it. */
  async removeMember(
    managerId: string,
    memberId: string,
  ): Promise<{ company: Company; member: User }> {
    const { company } = await this.manager(managerId);
    const member = await this.member(company, memberId);
    await this.demote(company.id, member.id);
    await this.users.setCompanyId(member.id, null);
    return { company, member };
  }

  /**
   * A Site Administrator makes a member a manager, for a Company whose managers
   * are gone. The member must already belong to it: this never puts anyone in.
   */
  async assignManager(companyId: string, memberId: string): Promise<Company> {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundError('No such company');
    const member = await this.member(company, memberId);
    const updated = await this.companies.setManager(company.id, member.id, true);
    if (!updated) throw new NotFoundError('No such company');
    return updated;
  }

  /**
   * Refuses a move that would strand the caller's current Company: its last
   * manager may not leave while others remain, or their requests could never
   * be answered. An early answer for filing a request; the move itself is
   * guarded again, atomically, by `stepDownToLeave`.
   */
  async assertCanLeave(user: User): Promise<void> {
    if (!user.companyId) return;
    const current = await this.companies.findById(user.companyId);
    if (!current || !isManagerOf(user, current)) return;

    const members = await this.users.listByCompany(current.id);
    const others = members.filter((member) => member.id !== user.id);
    const otherManagers = others.filter((member) => isManagerOf(member, current));
    if (others.length > 0 && otherManagers.length === 0) {
      throw new ConflictError('Make another member a manager before you leave this company');
    }
  }

  /**
   * Takes `user` off the managers of the Company they are about to leave, just
   * before the move (creating a Company, an approved or automatic join). The
   * pull is conditional on another manager remaining; when this is the last
   * one, they may go only if nobody is left behind. Returns an undo for a move
   * that then fails.
   */
  async stepDownToLeave(user: User): Promise<() => Promise<void>> {
    const nothing = async () => {};
    if (!user.companyId) return nothing;
    const current = await this.companies.findById(user.companyId);
    if (!current?.managerIds.includes(user.id)) return nothing;

    const restore = async () => {
      await this.companies.setManager(current.id, user.id, true);
    };
    if (await this.companies.removeManager(current.id, user.id, { keepOne: true })) return restore;

    const others = (await this.users.listByCompany(current.id)).filter(
      (member) => member.id !== user.id,
    );
    if (others.length > 0) {
      throw new ConflictError('Make another member a manager before you leave this company');
    }
    await this.companies.removeManager(current.id, user.id, { keepOne: false });
    return restore;
  }

  /**
   * Steps a member down, refusing if they are the last manager. Decided by the
   * store's conditional write, not by a count read beforehand, so concurrent
   * demotions leave at least one manager.
   */
  private async demote(companyId: string, userId: string): Promise<void> {
    if (await this.companies.removeManager(companyId, userId, { keepOne: true })) return;
    if ((await this.companies.findById(companyId))?.managerIds.includes(userId)) {
      throw new ConflictError('A company needs at least one manager');
    }
  }

  /** An officer's own account. Site Administrators hold no Company. */
  private async officer(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('No such account');
    if (user.role === 'admin') throw new ForbiddenError(SITE_ADMIN_HOLDS_NO_COMPANY);
    return user;
  }

  private async membership(userId: string): Promise<{ user: User; company: Company }> {
    const user = await this.users.findById(userId);
    if (!user?.companyId) throw new NotFoundError('No company for this account');
    const company = await this.companies.findById(user.companyId);
    if (!company) throw new NotFoundError('No company for this account');
    return { user, company };
  }

  private async manager(userId: string): Promise<{ user: User; company: Company }> {
    const found = await this.membership(userId);
    if (!isManagerOf(found.user, found.company)) {
      throw new ForbiddenError('Only a manager of this company can do that');
    }
    return found;
  }

  /**
   * An officer waiting to join this Company. Anyone else, a Site Administrator
   * with a request left over from before their promotion included, is "no
   * such request".
   */
  private async applicant(company: Company, userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (
      !user?.isActive ||
      user.role !== 'business_development_officer' ||
      user.joinRequest?.companyId !== company.id
    ) {
      throw new NotFoundError('No such join request');
    }
    return user;
  }

  /** Someone in this Company. Anyone else is "no such member", never a hint. */
  private async member(company: Company, userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user?.isActive || user.companyId !== company.id) {
      throw new NotFoundError('No such member');
    }
    return user;
  }
}
