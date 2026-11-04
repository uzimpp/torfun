import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TorListQuerySchema, ProcurementListResponseSchema, TorDetailSchema } from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import { audienceOf } from '../services/audience';

export const torRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/tors',
    {
      schema: {
        querystring: TorListQuerySchema,
        response: { 200: ProcurementListResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const { q, order, ...filters } = request.query;
      const audience = audienceOf(request.user.role);
      const { items, total } = await app.torService.list(
        { ...filters, query: q },
        audience,
        request.user.user_id,
        order ?? (audience === 'admin' ? 'daysLeft' : 'match'),
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
          200: TorDetailSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return app.torService.detail(
        request.params.projectId,
        audienceOf(request.user.role),
        request.user.user_id,
      );
    },
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
