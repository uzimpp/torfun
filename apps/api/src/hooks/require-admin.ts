import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../core/errors';
import { requireAuth } from './require-auth';

/** onRequest hook: valid JWT *and* the ADMIN role. */
export async function requireAdmin(request: FastifyRequest) {
  await requireAuth(request);

  if (request.user.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
}
