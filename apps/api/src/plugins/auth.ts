import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { loadEnv } from '../config/env';

export async function registerAuthPlugin(app: FastifyInstance) {
  const env = loadEnv();

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: '7d',
    },
    cookie: {
      cookieName: 'torfun_token',
      signed: false,
    },
  });
}
