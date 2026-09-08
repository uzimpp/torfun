import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  IngestionFailureSchema,
  IngestionOutcome,
  IngestionRecordSchema,
  IngestionState,
  IngestionSummarySchema,
  SoftwareClass,
} from '@torfun/types';
import { requireAdmin } from '../hooks/require-admin';

/**
 * Admin-facing API over the e-GP ingestion pipeline.
 *
 * Covers the functional requirements around visibility: an administrator can
 * see every ingested announcement's processing status, filter the queue, read
 * the failure log, and trigger a retrieval run.
 *
 * Every route here is admin-only, enforced once for the whole plugin scope
 * rather than per route — `/ingestion/run` spends the project's rate-limited
 * upstream allowance, so an unguarded route added later would be a real
 * exposure, not just an information leak.
 */

const ListQuerySchema = z.object({
  state: IngestionState.optional(),
  outcome: IngestionOutcome.optional(),
  deptName: z.string().optional(),
  year: z.coerce.number().int().optional(),
  softwareClass: SoftwareClass.optional(),
  eBidding: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

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
        querystring: ListQuerySchema,
        response: {
          200: z.object({
            items: z.array(IngestionRecordSchema),
            total: z.number().int(),
            limit: z.number().int(),
            offset: z.number().int(),
          }),
        },
      },
    },
    async (request) => {
      const { q, ...filters } = request.query;
      const { items, total } = app.ingestionService.list({ ...filters, query: q });
      return { items, total, limit: filters.limit, offset: filters.offset };
    },
  );

  app.get(
    '/ingestion/projects/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string() }),
        response: {
          200: IngestionRecordSchema,
          404: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => app.ingestionService.get(request.params.projectId),
  );

  app.get(
    '/ingestion/failures',
    {
      schema: {
        response: { 200: z.object({ items: z.array(IngestionFailureSchema) }) },
      },
    },
    async () => ({ items: app.ingestionService.failures() }),
  );

  app.post(
    '/ingestion/run',
    {
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
