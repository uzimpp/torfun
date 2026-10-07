import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../core/errors';

/** onRequest hook: rejects the request unless it carries a valid JWT. */
export async function requireAuth(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError();
  }
}
