import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ACCESS_COOKIE, fullName, REFRESH_COOKIE } from '@torfun/types';
import { loadEnv } from '../config/env';
import { AppError, BadRequestError, UnauthorizedError } from '../core/errors';
import { ACCESS_TTL_SECONDS, REFRESH_COOKIE_PATH } from '../plugins/jwt';
import { REFRESH_TTL_SECONDS, type AuthResult } from '../services/auth.service';
import type { User } from '@torfun/types';
import { fetchGoogleProfile } from '../services/google-identity';
import { requireAuth } from '../hooks/require-auth';
import { authIpRateLimit } from '../plugins/security';
import { createCredentialThrottle } from '../hooks/throttle-credentials';

/**
 * HTTP surface for authentication. Every handler here does the same three
 * things and nothing else: validate input, call `app.authService`, and shape
 * the response. Account rules live in the service; storage in the repository.
 */

const registerSchema = z
  .object({
    username: z.string().min(3).max(50),
    password: z.string().min(8).max(128),
    confirm_password: z.string(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    company_name: z.string().min(1).max(200),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

/** snake_case on the wire: the shape `apps/web` already consumes. */
function toUserResponse(user: User) {
  return {
    id: user.id,
    username: user.username,
    first_name: user.firstName,
    last_name: user.lastName,
    full_name: fullName(user),
    company_name: user.companyName,
    role: user.role,
  };
}

/**
 * Writes both halves of a session.
 *
 * The access cookie expires with the token inside it, so once it lapses the
 * browser simply stops sending one — which is the signal the web app uses to
 * call `/refresh`, where the still-valid refresh cookie lives.
 */
function setAuthCookies(reply: FastifyReply, { accessToken, refreshToken }: AuthResult) {
  const shared = {
    httpOnly: true,
    secure: loadEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  } as const;

  reply.setCookie(ACCESS_COOKIE, accessToken, { ...shared, maxAge: ACCESS_TTL_SECONDS });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...shared,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_SECONDS,
  });
}

function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * Brute-force guards for the two endpoints that accept a password. Declared
   * once so `/login` and `/register` cannot drift apart: registration is
   * equally worth throttling, since it reveals which usernames are taken.
   */
  const credentialLimits = {
    config: { rateLimit: authIpRateLimit },
    preHandler: [createCredentialThrottle(app)],
  };

  app.get('/google/callback', async (request, reply) => {
    let session: AuthResult;
    try {
      const { token: oauthToken } =
        await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
      const profile = await fetchGoogleProfile(oauthToken.access_token);
      session = await app.authService.loginWithGoogle(profile);
    } catch (error) {
      if (error instanceof AppError) throw error;
      app.log.error({ err: error }, 'auth: google sign-in failed');
      throw new AppError('Google authentication failed', 500);
    }

    setAuthCookies(reply, session);
    return reply.redirect(`${loadEnv().WEB_APP_URL}/dashboard`);
  });

  app.post('/register', credentialLimits, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid registration data', parsed.error.flatten());
    }

    const session = await app.authService.register({
      username: parsed.data.username,
      password: parsed.data.password,
      firstName: parsed.data.first_name,
      lastName: parsed.data.last_name,
      companyName: parsed.data.company_name,
    });

    setAuthCookies(reply, session);
    return reply.code(201).send({
      message: 'Registration successful',
      user: toUserResponse(session.user),
    });
  });

  app.post('/login', credentialLimits, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid login data');
    }

    const session = await app.authService.login(parsed.data.username, parsed.data.password);

    setAuthCookies(reply, session);
    return reply.send({ message: 'Login successful', user: toUserResponse(session.user) });
  });

  /**
   * Renews a session. The only endpoint that reads the refresh cookie, and the
   * only one where a role change or a deactivation is picked up.
   */
  app.post('/refresh', async (request, reply) => {
    const presented = request.cookies[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedError('No session to refresh');

    try {
      const session = await app.authService.refresh(presented);
      setAuthCookies(reply, session);
      return reply.send({ message: 'Session refreshed', user: toUserResponse(session.user) });
    } catch (error) {
      // A refresh that fails is a session that is over — revoked, expired, or
      // deactivated. Drop both cookies so the browser stops re-presenting them
      // on every navigation and the user is sent to the login page once.
      clearAuthCookies(reply);
      throw error;
    }
  });

  app.post('/logout', async (request, reply) => {
    await app.authService.logout(request.cookies[REFRESH_COOKIE]);
    clearAuthCookies(reply);
    return reply.send({ message: 'Logout successful' });
  });

  app.get('/me', { onRequest: [requireAuth] }, async (request) => {
    const user = await app.authService.getById(request.user.user_id);
    return toUserResponse(user);
  });
}
