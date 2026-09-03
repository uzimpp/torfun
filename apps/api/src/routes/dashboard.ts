import type { FastifyInstance } from 'fastify';
import { require_auth } from '../auth/require-auth';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/dashboard',
    {
      onRequest: [require_auth],
    },
    async (request) => {
      return {
        message: `Welcome ${request.user.username}`,
      };
    },
  );
}
