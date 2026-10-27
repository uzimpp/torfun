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
import {
  ProcurementRepository,
  type AgencyNameSource,
  type IngestionStatsSource,
  type ProcurementDataSource,
} from './repositories/procurement.repository';
import {
  IngestionRunRepository,
  type IngestionRunStore,
} from './repositories/ingestion-run.repository';
import {
  IngestionLeaseRepository,
  type IngestionLeaseStore,
} from './repositories/ingestion-lease.repository';
import { ScheduleRepository, type ScheduleStore } from './repositories/schedule.repository';
import { createDependencyProbes, DiagnosticsService } from './services/diagnostics.service';
import {
  RefreshTokenRepository,
  type RefreshTokenStore,
} from './repositories/refresh-token.repository';
import { UserRepository, type UserStore } from './repositories/user.repository';
import { CompanyRepository, type CompanyStore } from './repositories/company.repository';
import { ClientRepository, type ClientStore } from './repositories/client.repository';
import { ExperienceRepository, type ExperienceStore } from './repositories/experience.repository';
import { AuthService } from './services/auth.service';
import { AdminUsersService } from './services/admin-users.service';
import { CompanyService } from './services/company.service';
import { ClientService } from './services/client.service';
import { ExperienceService } from './services/experience.service';
import { IngestionService } from './services/ingestion.service';
import { ProcurementAdminService } from './services/procurement-admin.service';
import { ScheduleService } from './services/schedule.service';
import { SchedulerService } from './services/scheduler.service';
import { TorService } from './services/tor.service';
import { registerRoutes } from './routes';

/**
 * Stores this app should use instead of the Mongo-backed ones.
 *
 * The same argument `env` already makes, one layer further down:
 * configuration is a parameter rather than a global, and so is persistence.
 * Production passes nothing and gets the real repositories; a test passes
 * in-memory stores from `src/testing/` and can then exercise the whole stack —
 * routing, validation, hooks, error mapping and all — through `app.inject`
 * without a database. That is the API's highest seam, and it is the one where
 * a test asserts on a status code and a body rather than on which method some
 * service happened to call.
 *
 * Each key is the *store interface*, never the repository class, so a
 * substitute cannot quietly gain access to a query the service layer has no
 * business issuing.
 */
export interface RepositoryOverrides {
  users?: UserStore;
  refreshTokens?: RefreshTokenStore;
  companies?: CompanyStore;
  clients?: ClientStore;
  experiences?: ExperienceStore;
  procurements?: ProcurementDataSource;
  /** The lock that keeps ingestion to one Run at a time, across processes. */
  ingestionLease?: IngestionLeaseStore;
  /** The log of finished Runs. */
  ingestionRuns?: IngestionRunStore;
  /** Stored history the operations view reads. */
  ingestionStats?: IngestionStatsSource;
  /** The setting for when Runs start on their own, and when the last one began. */
  schedule?: ScheduleStore;
  /** Only the distinct agency names are read, for the client typeahead. */
  agencyNames?: AgencyNameSource;
}

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
 * `config/env.ts` would otherwise make impossible. `repositories` is the same
 * idea applied to storage — see `RepositoryOverrides`.
 */
export async function buildApp(env: Env = loadEnv(), repositories: RepositoryOverrides = {}) {
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

  // Constructing a repository is offline — Mongo connects lazily on the first
  // query — so building the real ones costs nothing even when a substitute
  // replaces them.
  const mongoProcurements = new ProcurementRepository(app.mongo.getDb);
  const procurementRepository = repositories.procurements ?? mongoProcurements;
  const userRepository = repositories.users ?? new UserRepository(app.mongo.getDb);
  const refreshTokenRepository =
    repositories.refreshTokens ?? new RefreshTokenRepository(app.mongo.getDb);
  const companyRepository = repositories.companies ?? new CompanyRepository(app.mongo.getDb);
  const clientRepository = repositories.clients ?? new ClientRepository(app.mongo.getDb);
  const experienceRepository =
    repositories.experiences ?? new ExperienceRepository(app.mongo.getDb);
  const ingestionLease =
    repositories.ingestionLease ?? new IngestionLeaseRepository(app.mongo.getDb);
  const scheduleStore = repositories.schedule ?? new ScheduleRepository(app.mongo.getDb);
  const ingestionRuns = repositories.ingestionRuns ?? new IngestionRunRepository(app.mongo.getDb);
  const ingestionStats = repositories.ingestionStats ?? mongoProcurements;
  const agencyNames = repositories.agencyNames ?? procurementRepository;

  app.decorate(
    'authService',
    new AuthService(userRepository, refreshTokenRepository, (payload) => app.jwt.sign(payload)),
  );
  app.decorate('adminUsersService', new AdminUsersService(userRepository));
  app.decorate('companyService', new CompanyService(companyRepository, userRepository));
  app.decorate(
    'clientService',
    new ClientService(clientRepository, experienceRepository, userRepository, agencyNames),
  );
  app.decorate(
    'experienceService',
    new ExperienceService(experienceRepository, clientRepository, userRepository),
  );
  const ingestionService = new IngestionService(procurementRepository, env, app.log, {
    lease: ingestionLease,
    runLog: scheduleStore,
    runs: ingestionRuns,
    stats: ingestionStats,
  });
  app.decorate('ingestionService', ingestionService);
  app.decorate(
    'procurementAdminService',
    new ProcurementAdminService(
      procurementRepository,
      (input) => ingestionService.startRun(input),
      app.log,
    ),
  );
  app.decorate('scheduleService', new ScheduleService(scheduleStore));

  // Built here, started by `server.ts`: a timer running behind every
  // `buildApp()` would leak into each test that builds an app. Stopping on close
  // is safe either way.
  const schedulerService = new SchedulerService(
    scheduleStore,
    (input) => ingestionService.startRun(input),
    app.log,
  );
  app.decorate('schedulerService', schedulerService);
  app.addHook('onClose', async () => schedulerService.stop());
  app.decorate('torService', new TorService(procurementRepository));
  app.decorate(
    'diagnosticsService',
    new DiagnosticsService(createDependencyProbes(env, app.mongo.getDb)),
  );

  await registerRoutes(app);

  return app;
}
