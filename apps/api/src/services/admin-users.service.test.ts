import { beforeEach, describe, expect, test } from 'bun:test';
import { AdminUsersService } from './admin-users.service';
import { AppError } from '../core/errors';
import { InMemoryUserStore } from '../testing/user-store';

/**
 * The account-management rules, at the service seam: who a Site Administrator
 * may promote, demote or deactivate, and the two things they may never do —
 * touch their own account, or remove the last one of themselves (ADR-0011).
 *
 * Framework-free by design, so these run against the in-memory `UserStore`
 * with no Mongo and no Fastify.
 */

const status = (error: unknown) => (error instanceof AppError ? error.statusCode : undefined);

describe('AdminUsersService', () => {
  let users: InMemoryUserStore;
  let service: AdminUsersService;

  beforeEach(() => {
    users = new InMemoryUserStore();
    service = new AdminUsersService(users);
  });

  test('list returns every account, newest first', async () => {
    const first = users.seed({ username: 'somchai' });
    const second = users.seed({ username: 'malee' });

    const listed = await service.list();

    expect(listed.map((user) => user.id)).toEqual([second.id, first.id]);
  });

  test('an unknown target is a 404', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });

    const error = await service.update(admin.id, 'nobody', { isActive: false }).catch((e) => e);

    expect(status(error)).toBe(404);
  });

  test('an administrator cannot change their own account', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    users.seed({ username: 'root2', role: 'admin' });

    const error = await service.update(admin.id, admin.id, { role: 'business_development_officer' }).catch((e) => e);

    expect(status(error)).toBe(403);
    expect((await users.findById(admin.id))?.role).toBe('admin');
  });

  test('a Business Development Officer is promoted to administrator', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    const officer = users.seed({ username: 'somchai' });

    const updated = await service.update(admin.id, officer.id, { role: 'admin' });

    expect(updated.role).toBe('admin');
  });

  test('promotion to administrator clears the Company the officer had joined', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    const officer = users.seed({ username: 'somchai', companyId: 'company-1' });

    const updated = await service.update(admin.id, officer.id, { role: 'admin' });

    expect(updated.companyId).toBeNull();
  });

  test('revoking the role leaves a plain officer with no Company', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    const other = users.seed({ username: 'malee', role: 'admin' });

    const updated = await service.update(admin.id, other.id, {
      role: 'business_development_officer',
    });

    expect(updated.role).toBe('business_development_officer');
    expect(updated.companyId).toBeNull();
  });

  test('the last active administrator cannot be demoted', async () => {
    const lone = users.seed({ username: 'onlyadmin', role: 'admin' });
    const someone = users.seed({ username: 'somchai' });

    const error = await service
      .update(someone.id, lone.id, { role: 'business_development_officer' })
      .catch((e) => e);

    expect(status(error)).toBe(409);
    expect((await users.findById(lone.id))?.role).toBe('admin');
  });

  test('the last active administrator cannot be deactivated', async () => {
    const lone = users.seed({ username: 'onlyadmin', role: 'admin' });
    // An already-deactivated second admin does not count, so `lone` is still last.
    users.seed({ username: 'ghost', role: 'admin', isActive: false });
    const someone = users.seed({ username: 'somchai' });

    const error = await service
      .update(someone.id, lone.id, { isActive: false })
      .catch((e) => e);

    expect(status(error)).toBe(409);
    expect((await users.findById(lone.id))?.isActive).toBe(true);
  });

  test('an administrator is demoted while a second active one remains', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    const other = users.seed({ username: 'malee', role: 'admin' });

    const updated = await service.update(admin.id, other.id, {
      role: 'business_development_officer',
    });

    expect(updated.role).toBe('business_development_officer');
  });

  test('deactivating a Business Development Officer is always allowed', async () => {
    const admin = users.seed({ username: 'root', role: 'admin' });
    const officer = users.seed({ username: 'somchai' });

    const updated = await service.update(admin.id, officer.id, { isActive: false });

    expect(updated.isActive).toBe(false);
  });
});
