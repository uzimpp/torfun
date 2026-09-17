import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { RateLimitOptions } from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';

/**
 * OWASP-baseline hardening: secure headers (helmet), a locked-down CORS
 * allowlist, and per-IP rate limiting against brute-force/abuse (OWASP API4).
 */
export async function registerSecurityPlugins(app: FastifyInstance, env: Env) {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
}

/**
 * Credential endpoints need a far tighter limit than the global one: 100
 * requests/minute is an abuse ceiling, not a brute-force defence, since it
 * still permits tens of thousands of password guesses a day.
 *
 * This caps how much one host can attempt, which is what catches password
 * spraying across many accounts. The per-account half of the defence is
 * `createCredentialThrottle` in `hooks/throttle-credentials.ts`.
 */
export const authIpRateLimit: RateLimitOptions = {
  max: 30,
  timeWindow: '15 minutes',
  keyGenerator: (request) => `auth-ip:${request.ip}`,
};
