import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { loadEnv, type Env } from './config/env';
import { registerErrorHandler } from './core/errors';
import { registerMongo } from './core/mongo';
import { registerSecurityPlugins } from './plugins/security';
import { registerJwt } from './plugins/jwt';
import { registerGoogleOAuth } from './plugins/google-oauth';
import { ProcurementRepository } from './repositories/procurement.repository';
import { createDependencyProbes, DiagnosticsService } from './services/diagnostics.service';
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
 *
 * `env` is a parameter, not something this function reaches out for. Production
 * gets the default and never passes one; a test passes `testEnv({ ... })` and
 * can therefore vary configuration per case, which a module-level cache in
 * `config/env.ts` would otherwise make impossible.
 */
export async function buildApp(env: Env = loadEnv()) {
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

  // Routes read configuration from here rather than importing `loadEnv`, for
  // the same reason they read services from here rather than constructing one.
  app.decorate('env', env);

  const userRepository = new UserRepository(app.mongo.getDb);
  const refreshTokenRepository = new RefreshTokenRepository(app.mongo.getDb);
  const procurementRepository = new ProcurementRepository(app.mongo.getDb);

  app.decorate(
    'authService',
    new AuthService(userRepository, refreshTokenRepository, (payload) => app.jwt.sign(payload)),
  );
  app.decorate('ingestionService', new IngestionService(procurementRepository, env, app.log));
  app.decorate(
    'diagnosticsService',
    new DiagnosticsService(createDependencyProbes(env, app.mongo.getDb)),
  );

  await registerRoutes(app);

  return app;
}
