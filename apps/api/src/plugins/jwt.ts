import fastifyJwt from '@fastify/jwt';
import { ACCESS_COOKIE } from '@torfun/types';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';

/**
 * The refresh cookie is scoped to the auth routes so it isn't attached to
 * every dashboard and ingestion request. `/api/auth` rather than the refresh
 * endpoint alone, because `/logout` has to see the token to revoke it.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * Access-token lifetime. Short on purpose: it bounds how long a stolen token
 * keeps working, and how long a role change or a deactivation goes unnoticed,
 * since nothing is looked up per request. Renewal is the refresh token's job —
 * see `AuthService.refresh`.
 */
export const ACCESS_TTL_SECONDS = 15 * 60;

export async function registerJwt(app: FastifyInstance, env: Env) {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: ACCESS_TTL_SECONDS },
    cookie: { cookieName: ACCESS_COOKIE, signed: false },
  });
}
