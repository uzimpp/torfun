import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../hooks/require-admin';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/test', { onRequest: [requireAdmin] }, async (request) => ({
    message: `Welcome Admin ${request.user.username}`,
    role: request.user.role,
  }));
}
