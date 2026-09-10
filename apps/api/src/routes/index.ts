import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { adminRoutes } from './admin';
import { dashboardRoutes } from './dashboard';
import { ingestionRoutes } from './ingestion';
import { companyRoutes } from './companies';
import { clientRoutes } from './clients';
import { experienceRoutes } from './experiences';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(ingestionRoutes, { prefix: '/api' });
  // The vendor's own record. Each is its own plugin scope, which is what lets
  // `requireAuth` be added once per group rather than once per route.
  await app.register(companyRoutes, { prefix: '/api' });
  await app.register(clientRoutes, { prefix: '/api' });
  await app.register(experienceRoutes, { prefix: '/api' });

  // Future route groups (per feature analysis in the project brief):
  // - /api/tors            (list/filter/search, USR-01..03/06/08)
  // - /api/tors/:id/source (download/read original source, USR-07)
  // - /api/matching        (matching-score computation, feature 4)
  // - /api/users           (admin: manage accounts, USR-10)
}
