import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import { ForbiddenError } from '../core/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for the cookie session (ASVS V3.5.1, V3.5.2; threat T-04).
 *
 * SameSite=Lax already withholds the cookie from cross-site POSTs in current
 * browsers, and CORS stops a foreign page from reading responses. This closes
 * the remaining gap: a state-changing request that carries an `Origin` header
 * naming anything outside `CORS_ORIGINS` is refused before it reaches a
 * handler, whatever cookie it brings.
 *
 * A request with no `Origin` is let through. Browsers always send one on
 * cross-origin unsafe requests, so its absence means a non-browser client
 * (curl, the test suite, server-to-server), which has no ambient cookie for an
 * attacker to ride.
 */
export function registerOriginGuard(app: FastifyInstance, env: Env) {
  const allowed = new Set(env.CORS_ORIGINS);

  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    if (origin === undefined || allowed.has(origin)) return;

    request.log.warn({ origin, method: request.method, url: request.url }, 'csrf: origin refused');
    throw new ForbiddenError();
  });
}
