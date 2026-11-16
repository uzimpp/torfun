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

  // ASVS V14.3.2: API responses carry account and company data, so no browser
  // or shared cache may keep them unless a route deliberately says otherwise.
  app.addHook('onSend', async (_request, reply, payload) => {
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
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

/**
 * Tighter per-route budgets for work that costs money or capacity (ASVS V2.4.1,
 * V15.2.2; threat T-13). The global 100/min stops floods; these stop one caller
 * from draining Vertex AI quota, the upstream e-GP gate or the PDF fetcher with
 * a handful of well-formed requests.
 */
export const expensiveRouteLimit = {
  /** Starting an ingestion Run: at most a few per quarter hour, whoever asks. */
  ingestionRun: { max: 5, timeWindow: '15 minutes' } satisfies RateLimitOptions,
  /** Admin actions that trigger a model or upstream read for one project. */
  upstreamRead: { max: 30, timeWindow: '15 minutes' } satisfies RateLimitOptions,
  /** Downloading a source PDF through the API. */
  sourceDownload: { max: 60, timeWindow: '1 minute' } satisfies RateLimitOptions,
  /** Submitting a report on a TOR: a human action, not a loop. */
  reportSubmit: { max: 10, timeWindow: '15 minutes' } satisfies RateLimitOptions,
};
