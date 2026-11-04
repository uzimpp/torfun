import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAdmin } from '../hooks/require-admin';
import { requireAuth } from '../hooks/require-auth';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({ status: z.literal('ok'), uptimeSeconds: z.number() }),
        },
      },
    },
    async () => ({ status: 'ok' as const, uptimeSeconds: process.uptime() }),
  );

  /**
   * Whether the external dependencies are actually reachable, and which one is
   * not.
   *
   * Separate from `/health` on purpose. That one is the liveness probe and must
   * answer with nothing else running; this makes real calls to Atlas, Vertex
   * and the open-data API. Vertex is billed per call and upstream has bad days,
   * so this must never be wired to a container health check — it is a thing an
   * administrator asks, not something polled.
   */
  app.get(
    '/health/dependencies',
    {
      onRequest: [requireAuth, requireAdmin],
      schema: {
        response: {
          200: z.object({
            ok: z.boolean(),
            checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string() })),
          }),
        },
      },
    },
    async () => app.diagnosticsService.run(),
  );
};
