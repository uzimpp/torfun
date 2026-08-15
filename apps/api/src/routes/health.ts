import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

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
};
