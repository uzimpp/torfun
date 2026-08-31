import type { FastifyInstance } from 'fastify';

import { require_admin } from '../auth/require-admin';

export async function adminRoutes(app: FastifyInstance) {
  app.get(
    '/admin/test',
    {
      onRequest: [require_admin],
    },
    async (request) => {
      return {
        message: `Welcome Admin ${request.user.username}`,
        role: request.user.role,
      };
    },
  );
}
