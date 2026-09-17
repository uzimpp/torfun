import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { fullName, UserRole, type User } from '@torfun/types';
import { requireAdmin } from '../hooks/require-admin';

/**
 * Site Administrator surface: the account list and the one write that manages
 * it (USR-10).
 *
 * Every route here is admin-only, enforced once for the plugin scope — the same
 * pattern the ingestion routes use, and for the same reason: a route added
 * later without its own guard would be a real exposure, not an information leak.
 *
 * The rules behind `PATCH` — no self-targeting, the last active administrator is
 * untouchable, granting `admin` clears the Company — live in
 * `services/admin-users.service.ts`. This file only shapes the wire.
 */

const AdminUserResponse = z.object({
  id: z.string(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  email: z.string().nullable(),
  role: UserRole,
  is_active: z.boolean(),
  company_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** snake_case on the wire; the domain object stays camelCase. Never the hash. */
function toAdminUserResponse(user: User) {
  return {
    id: user.id,
    username: user.username,
    first_name: user.firstName,
    last_name: user.lastName,
    full_name: fullName(user),
    email: user.email ?? null,
    role: user.role,
    is_active: user.isActive,
    company_id: user.companyId,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

/** At least one of the two fields — an empty patch is a bad request. */
const PatchBody = z
  .object({
    role: UserRole.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => body.role !== undefined || body.is_active !== undefined, {
    message: 'Nothing to change',
  });

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin);

  app.get('/admin/test', async (request) => ({
    message: `Welcome Admin ${request.user.username}`,
    role: request.user.role,
  }));

  app.get(
    '/admin/users',
    {
      schema: {
        response: { 200: z.object({ users: z.array(AdminUserResponse) }) },
      },
    },
    async () => ({ users: (await app.adminUsersService.list()).map(toAdminUserResponse) }),
  );

  app.patch(
    '/admin/users/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: PatchBody,
        response: {
          200: AdminUserResponse,
          403: z.object({ message: z.string() }),
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const updated = await app.adminUsersService.update(
        request.user.user_id,
        request.params.id,
        {
          ...(request.body.role !== undefined ? { role: request.body.role } : {}),
          ...(request.body.is_active !== undefined ? { isActive: request.body.is_active } : {}),
        },
      );
      return toAdminUserResponse(updated);
    },
  );
};
