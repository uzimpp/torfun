import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { loadEnv } from './config/env';
import { registerSecurityPlugins } from './plugins/security';
import { registerRoutes } from './routes';
import { registerAuthPlugin } from './plugins/auth';
import { registerGoogleOAuth } from './plugins/google-oauth';

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await registerSecurityPlugins(app, env);
  await app.register(fastifyCookie);
  await registerAuthPlugin(app);
  await registerGoogleOAuth(app);
  await registerRoutes(app);

  return app;
}
