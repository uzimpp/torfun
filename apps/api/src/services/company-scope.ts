import { ConflictError, UnauthorizedError } from '../core/errors';
import type { UserStore } from '../repositories/user.repository';

/**
 * The Company a request is allowed to act on.
 *
 * Read from the stored user, never from the request: no endpoint in this
 * feature accepts a company id from its caller, so the only way to reach a
 * Client or an Experience is to already belong to the Company that owns it
 * (ADR-0008 accepts that anyone may *join* a Company; it does not accept that
 * anyone may address one they have not joined).
 *
 * Reading the user per request rather than trusting a claim in the token is
 * also what makes switching take effect immediately instead of at the next
 * refresh.
 */

/** The caller's Company, or a refusal. Used by everything that writes. */
export async function requireCompanyId(users: UserStore, userId: string): Promise<string> {
  const user = await users.findById(userId);
  // A valid token for an account that no longer exists is a dead session, not
  // a server fault.
  if (!user) throw new UnauthorizedError('Session user no longer exists');
  if (!user.companyId) {
    throw new ConflictError('Create or join a company before recording work');
  }
  return user.companyId;
}

/**
 * The caller's Company if they have one. Used by the list endpoints, where an
 * officer who has not joined yet should see an empty list rather than an
 * error — the web gate is what sends them to the company page, and a failing
 * request would only make that page harder to render.
 */
export async function optionalCompanyId(users: UserStore, userId: string): Promise<string | null> {
  return (await users.findById(userId))?.companyId ?? null;
}
