import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TooManyRequestsError } from '../core/errors';

/** Attempts allowed per account before the throttle bites, and the window. */
const MAX_ATTEMPTS = 10;
const WINDOW = '15 minutes';

/**
 * preHandler hook: per-account brute-force throttle for endpoints that take a
 * password.
 *
 * Layered under the per-IP limit in `plugins/security.ts` because the two stop
 * different attacks — that one catches a host spraying a common password
 * across many accounts, this one catches a single account being worked through
 * password by password from anywhere.
 *
 * Built on `createRateLimit` rather than `app.rateLimit()`: @fastify/rate-limit
 * runs at most one of its own hooks per request (it flags the request as
 * handled), so a second `rateLimit()` handler on a route that already has a
 * `config.rateLimit` silently does nothing.
 *
 * A preHandler rather than the usual onRequest, because the key needs the
 * parsed body.
 */
export function createCredentialThrottle(app: FastifyInstance) {
  const limiter = app.createRateLimit({
    max: MAX_ATTEMPTS,
    timeWindow: WINDOW,
    keyGenerator: (request) => {
      const body = request.body as { username?: unknown } | undefined;
      // Lower-cased so capitalising a letter doesn't buy a fresh budget, and
      // falling back to the IP so a request that omits the field entirely is
      // still counted rather than sharing one key with every other malformed
      // attempt.
      return typeof body?.username === 'string'
        ? `credentials:${body.username.toLowerCase()}`
        : `credentials-anon:${request.ip}`;
    },
  });

  return async function throttleCredentials(request: FastifyRequest, reply: FastifyReply) {
    const result = await limiter(request);

    // `isAllowed: true` means the key was allow-listed and never counted; a
    // counted request always comes back false and reports its verdict in
    // `isExceeded`.
    if (result.isAllowed || !result.isExceeded) return;

    reply.header('retry-after', result.ttlInSeconds);
    throw new TooManyRequestsError(
      `Too many attempts for this account. Try again in ${result.ttlInSeconds} seconds.`,
    );
  };
}
