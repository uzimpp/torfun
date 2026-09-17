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
import { requireAuth } from '../hooks/require-auth';

/**
 * Admin-facing API over the e-GP ingestion pipeline.
 *
 * Covers the functional requirements around visibility: an administrator can
 * see every ingested announcement's processing status, filter the queue, read
 * the failure log, and trigger a retrieval run.
 *
 * Queue controls and diagnostics are admin-only. Procurement reads are shared
 * with signed-in Business Development Officers because this is also the
 * existing backing index for `/search`; no route that spends upstream capacity
 * is opened to that role.
 */

export const ingestionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/ingestion/summary',
    {
      onRequest: requireAdmin,
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
      onRequest: requireAuth,
      schema: {
        querystring: ProcurementListQuerySchema,
        response: {
          200: ProcurementListResponseSchema,
        },
      },
    },
    async (request) => {
      const { q, ...filters } = request.query;
      const { items, total } = await app.ingestionService.list({ ...filters, query: q });
      return { items, total, limit: filters.limit, offset: filters.offset };
    },
  );

  app.get(
    '/ingestion/projects/:projectId',
    {
      onRequest: requireAuth,
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          200: ProcurementSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => app.ingestionService.get(request.params.projectId),
  );

  app.get(
    '/ingestion/failures',
    {
      onRequest: requireAdmin,
      schema: {
        response: { 200: z.object({ items: z.array(IngestionFailureSchema) }) },
      },
    },
    async () => ({ items: await app.ingestionService.failures() }),
  );

  app.post(
    '/ingestion/run',
    {
      onRequest: requireAdmin,
      schema: {
        body: z
          .object({
            eBiddingOnly: z.boolean().default(true),
            maxDownloads: z.number().int().positive().max(50).optional(),
          })
          .default({ eBiddingOnly: true }),
        response: {
          202: z.object({ started: z.literal(true), message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      app.ingestionService.startRun(request.body);
      return reply.code(202).send({
        started: true,
        message: 'Ingestion run started. Poll /api/ingestion/summary for progress.',
      });
    },
  );
};
