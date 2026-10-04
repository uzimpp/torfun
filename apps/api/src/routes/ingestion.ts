import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  IngestionFailureSchema,
  ProcurementListQuerySchema,
  ProcurementListResponseSchema,
  ProcurementSchema,
  IngestionSummarySchema,
} from '@torfun/types';
import { requireAdmin } from '../hooks/require-admin';
import { audienceOf } from '../services/audience';

/**
 * Admin-facing API over the e-GP ingestion pipeline.
 *
 * Covers the functional requirements around visibility: an administrator can
 * see every ingested announcement's processing status, filter the queue, read
 * the failure log, and trigger a retrieval run.
 *
 * Every route here is admin-only, enforced once for the whole plugin scope.
 * Officer-facing procurement search lives under `/tors`, so a route added to
 * this ingestion group cannot accidentally become available to non-admins.
 */

export const ingestionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin);

  app.get(
    '/ingestion/summary',
    {
      schema: {
        response: {
          200: IngestionSummarySchema.extend({ agencies: z.array(z.string()) }),
        },
      },
    },
    async () => app.ingestionService.summary(),
  );

  app.get(
    '/ingestion/projects',
    {
      schema: {
        querystring: ProcurementListQuerySchema,
        response: {
          200: ProcurementListResponseSchema,
        },
      },
    },
    async (request) => {
      const { q, ...filters } = request.query;
      const { items, total } = await app.ingestionService.list(
        { ...filters, query: q },
        audienceOf(request.user.role),
      );
      return { items, total, limit: filters.limit, offset: filters.offset };
    },
  );

  app.get(
    '/ingestion/projects/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          200: ProcurementSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) =>
      app.ingestionService.get(request.params.projectId, audienceOf(request.user.role)),
  );

  app.get(
    '/ingestion/failures',
    {
      schema: {
        response: { 200: z.object({ items: z.array(IngestionFailureSchema) }) },
      },
    },
    async () => ({ items: await app.ingestionService.failures() }),
  );

  app.post(
    '/ingestion/run',
    {
      schema: {
        body: z
          .object({
            forceDiscovery: z.boolean().optional(),
          })
          .default({}),
        response: {
          202: z.object({ started: z.literal(true), message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      await app.ingestionService.startRun(request.body);
      return reply.code(202).send({
        started: true,
        message: 'Ingestion run started. Poll /api/ingestion/summary for progress.',
      });
    },
  );

  app.post(
    '/ingestion/run/stop',
    {
      onRequest: requireAdmin,
      schema: {
        response: {
          202: z.object({ stopping: z.literal(true) }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      // Who asked (their username, as every administrator action records it) comes from the session and nothing else: the request carries
      // no body, and a name in the query string is not read.
      await app.ingestionService.requestStop(request.user.username);
      return reply.code(202).send({ stopping: true as const });
    },
  );

  app.get(
    '/ingestion/recent',
    {
      onRequest: requireAdmin,
      schema: {
        querystring: z.object({
          // Clamped, not rejected: a dashboard asking for more than it may have
          // still gets the most it is allowed.
          limit: z.coerce
            .number()
            .int()
            .positive()
            .default(5)
            .transform((limit) => Math.min(limit, 20)),
        }),
        response: { 200: z.object({ items: z.array(ProcurementSchema) }) },
      },
    },
    async (request) => ({ items: await app.ingestionService.recent(request.query.limit) }),
  );
};
