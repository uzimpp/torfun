import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { loadEnv } from './config/env';
import { registerErrorHandler } from './core/errors';
import { registerMongo } from './core/mongo';
import { registerSecurityPlugins } from './plugins/security';
import { registerJwt } from './plugins/jwt';
import { registerGoogleOAuth } from './plugins/google-oauth';
import { IngestionRepository } from './repositories/ingestion.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { IngestionService } from './services/ingestion.service';
import { registerRoutes } from './routes';

/**
 * Composition root.
 *
 * The only place that knows how the layers fit together: plugins first (order
 * matters — cookies before JWT, JWT before anything that signs a token), then
 * repositories, then the services built on them, decorated onto the instance
 * so route files can stay free of construction logic.
 */
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
  registerErrorHandler(app);

  await registerSecurityPlugins(app, env);
  await app.register(fastifyCookie);
  await registerJwt(app, env);
  await registerGoogleOAuth(app, env);
  registerMongo(app, env);

  const userRepository = new UserRepository(app.mongo.getDb);
  const refreshTokenRepository = new RefreshTokenRepository(app.mongo.getDb);
  const ingestionRepository = new IngestionRepository();

  app.decorate(
    'authService',
    new AuthService(userRepository, refreshTokenRepository, (payload) => app.jwt.sign(payload)),
  );
  app.decorate('ingestionService', new IngestionService(ingestionRepository, env, app.log));

  await registerRoutes(app);

  return app;
}
