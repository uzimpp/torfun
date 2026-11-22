import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../core/errors';

/**
 * onRequest hook: rejects the request unless it carries a valid JWT *and* the
 * session it names is still alive.
 *
 * The second half is what makes logout, account disabling and password change
 * take effect immediately rather than after the 15-minute access token runs
 * out (ASVS V7.4.1, V7.4.2, V9.2.1).
 */
export async function requireAuth(request: FastifyRequest) {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError();
  }

  if (!(await request.server.authService.isSessionActive(request.user.sid))) {
    throw new UnauthorizedError('Session ended');
  }
}
