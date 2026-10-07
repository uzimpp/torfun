import type { User, UserRole } from '@torfun/types';
import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors';
import type { UserStore } from '../repositories/user.repository';

/**
 * What a Site Administrator may do to the other accounts (USR-10): read them
 * all, activate or deactivate one, and grant or revoke the `admin` role.
 *
 * Two rules are load-bearing and both exist so the screen cannot lock every
 * human out of `admin` — recoverable only by editing Mongo (ADR-0011):
 *
 *  - **No self-targeting.** An administrator cannot change their own role or
 *    active flag; a second administrator has to do it.
 *  - **The last active administrator is untouchable.** Demoting or deactivating
 *    them is refused while they are the only one left.
 *
 * Granting `admin` also clears any `companyId`: a Site Administrator holds no
 * Company. Revoking it leaves a plain Business Development Officer who rejoins
 * one through the normal typeahead.
 *
 * Framework-free by design — it takes a `UserStore`, throws domain errors, and
 * never touches a reply — so the rules above are testable without a server.
 */

export interface AdminUserPatch {
  role?: UserRole;
  isActive?: boolean;
}

export class AdminUsersService {
  constructor(private readonly users: UserStore) {}

  list(): Promise<User[]> {
    return this.users.list();
  }

  async update(
    actingUserId: string,
    targetId: string,
    patch: AdminUserPatch,
  ): Promise<User> {
    const target = await this.users.findById(targetId);
    if (!target) throw new NotFoundError('No such account');

    if (actingUserId === targetId) {
      throw new ForbiddenError('You cannot change your own role or account status');
    }

    const demoted = patch.role !== undefined && patch.role !== 'admin' && target.role === 'admin';
    const deactivated = patch.isActive === false && target.role === 'admin' && target.isActive;
    if ((demoted || deactivated) && (await this.users.countActiveAdmins()) <= 1) {
      throw new ConflictError(
        'The last active administrator cannot be demoted or deactivated',
      );
    }

    if (patch.role !== undefined && patch.role !== target.role) {
      await this.users.setRole(targetId, patch.role);
      if (patch.role === 'admin' && target.companyId !== null) {
        await this.users.setCompanyId(targetId, null);
      }
    }
    if (patch.isActive !== undefined && patch.isActive !== target.isActive) {
      await this.users.setActive(targetId, patch.isActive);
    }

    const updated = await this.users.findById(targetId);
    if (!updated) throw new NotFoundError('No such account');
    return updated;
  }
}
