import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ProcurementListQuerySchema,
  ProcurementListResponseSchema,
  ProcurementSchema,
} from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import { audienceOf } from '../services/audience';

export const torRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/tors',
    {
      schema: {
        querystring: ProcurementListQuerySchema,
        response: { 200: ProcurementListResponseSchema },
      },
    },
    async (request) => {
      const { q, ...filters } = request.query;
      const { items, total } = await app.torService.list(
        { ...filters, query: q },
        audienceOf(request.user.role),
      );
      return { items, total, limit: filters.limit, offset: filters.offset };
    },
  );

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
    async (request) => app.torService.get(request.params.projectId, audienceOf(request.user.role)),
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
      const source = await app.torService.source(
        request.params.projectId,
        audienceOf(request.user.role),
      );
      const filename = source.filename.replace(/[\\"\r\n]/g, '_');
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(Buffer.from(source.bytes));
    },
  );
};
