import fastifyOauth2 from '@fastify/oauth2';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';

export async function registerGoogleOAuth(app: FastifyInstance, env: Env) {
  await app.register(fastifyOauth2, {
    name: 'googleOAuth2',
    scope: ['openid', 'email', 'profile'],
    credentials: {
      client: {
        id: env.GOOGLE_CLIENT_ID,
        secret: env.GOOGLE_CLIENT_SECRET,
      },
      auth: fastifyOauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/api/auth/google',
    callbackUri: env.GOOGLE_OAUTH_CALLBACK_URL,
    pkce: 'S256',
  });
}
