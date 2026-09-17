import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../hooks/require-auth';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { onRequest: [requireAuth] }, async (request) => ({
    message: `Welcome ${request.user.username}`,
  }));
}
