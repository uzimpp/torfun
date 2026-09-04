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
import { loadEnv } from '../config/env';
import { ingestionRepository } from '../repositories/ingestion-repository';
import { runIngestion } from '../services/egp/pipeline';

/**
 * Admin-facing API over the e-GP ingestion pipeline.
 *
 * Covers the functional requirements around visibility: an administrator can
 * see every ingested announcement's processing status, filter the queue, read
 * the failure log, and trigger a retrieval run.
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

/** Only one run at a time: the pipeline is deliberately slow and polite. */
let runInFlight = false;

export const ingestionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/ingestion/summary',
    {
      schema: {
        response: {
          200: IngestionSummarySchema.extend({ agencies: z.array(z.string()) }),
        },
      },
    },
    async () => ({
      ...ingestionRepository.summary(),
      agencies: ingestionRepository.agencies(),
      runInProgress: runInFlight,
    }),
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
      const { items, total } = ingestionRepository.find({ ...filters, query: q });
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
    async (request, reply) => {
      const record = ingestionRepository.get(request.params.projectId);
      if (!record) {
        return reply.code(404).send({ message: `No ingested project ${request.params.projectId}` });
      }
      return record;
    },
  );

  app.get(
    '/ingestion/failures',
    {
      schema: {
        response: { 200: z.object({ items: z.array(IngestionFailureSchema) }) },
      },
    },
    async () => ({ items: ingestionRepository.listFailures() }),
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
      if (runInFlight) {
        return reply.code(409).send({ message: 'An ingestion run is already in progress.' });
      }

      const env = loadEnv();
      runInFlight = true;

      // Deliberately not awaited: a full run takes minutes because of the
      // politeness delays, far longer than a request should hold open. Progress
      // is observable through the per-project status the UI already polls.
      void runIngestion(ingestionRepository, {
        apiKey: env.EGP_API_KEY,
        maxDownloads: request.body.maxDownloads ?? env.EGP_MAX_DOWNLOADS_PER_RUN,
        eBiddingOnly: request.body.eBiddingOnly,
        logger: app.log,
      })
        .catch((error: unknown) => {
          app.log.error({ err: error }, 'egp: ingestion run failed');
        })
        .finally(() => {
          runInFlight = false;
        });

      return reply.code(202).send({
        started: true,
        message: 'Ingestion run started. Poll /api/ingestion/summary for progress.',
      });
    },
  );
};
