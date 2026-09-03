import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';
import { authRoutes } from './auth';
import { adminRoutes } from './admin';
import { dashboardRoutes } from './dashboard';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });

  // Future route groups (per feature analysis in the project brief):
  // - /api/tors            (list/filter/search, USR-01..03/06/08)
  // - /api/tors/:id/source (download/read original source, USR-07)
  // - /api/matching        (matching-score computation, feature 4)
  // - /api/crawler         (admin: schedule/trigger crawls, USR-09)
  // - /api/users           (admin: manage accounts, USR-10)
  // - /api/auth            (login/logout)
}
