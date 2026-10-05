import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProcurementSchema } from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';

export const torRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/tors/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        response: {
          200: ProcurementSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => app.torService.get(request.params.projectId),
  );

  app.get(
    '/tors/:projectId/source',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        response: { 200: z.any(), 404: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      const source = await app.torService.source(request.params.projectId);
      const filename = source.filename.replace(/[\\"\r\n]/g, '_');
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(Buffer.from(source.bytes));
    },
  );
};
