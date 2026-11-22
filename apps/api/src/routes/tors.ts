import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  BudgetComparisonSchema,
  ContractYearQuerySchema,
  ProjectContractsResponseSchema,
  ProjectContractSubmissionsResponseSchema,
  TorListQuerySchema,
  ProcurementListResponseSchema,
  TorDetailSchema,
  ProcurementYearsResponseSchema,
  SimilarAwardsSchema,
} from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import { audienceOf } from '../services/audience';

export const torRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/tors/years',
    {
      schema: {
        response: { 200: ProcurementYearsResponseSchema },
      },
    },
    async () => ({ years: await app.torService.years() }),
  );

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
    '/tors/:projectId/budget-comparison',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        response: { 200: BudgetComparisonSchema, 404: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return app.torService.budgetComparison(
        request.params.projectId,
        audienceOf(request.user.role),
      );
    },
  );

  // POST, not GET: it spends the open-data API's daily allowance, so a link prefetch,
  // a crawler or a reload must never trigger it. The page calls it from a button.
  app.post(
    '/tors/:projectId/similar-awards',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        response: { 200: SimilarAwardsSchema, 404: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      return app.similarAwardsService.find(request.params.projectId, audienceOf(request.user.role));
    },
  );

  app.get(
    '/tors/:projectId/contracts',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        querystring: ContractYearQuerySchema,
        response: { 200: ProjectContractsResponseSchema },
      },
    },
    async (request) => {
      await app.torService.get(request.params.projectId, audienceOf(request.user.role));
      return {
        items: await app.contractsService.listContracts(
          request.params.projectId,
          request.query.contract_year,
        ),
      };
    },
  );

  app.get(
    '/tors/:projectId/contract-submissions',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        querystring: ContractYearQuerySchema,
        response: { 200: ProjectContractSubmissionsResponseSchema },
      },
    },
    async (request) => {
      await app.torService.get(request.params.projectId, audienceOf(request.user.role));
      return {
        items: await app.contractsService.listSubmissions(
          request.params.projectId,
          request.query.contract_year,
        ),
      };
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
