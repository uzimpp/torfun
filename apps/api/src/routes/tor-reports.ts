import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateTorReportSchema,
  TorReportListQuerySchema,
  TorReportListResponseSchema,
  TorReportResponseSchema,
  type TorReport,
} from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import { requireAdmin } from '../hooks/require-admin';

function toResponse(report: TorReport) {
  return {
    id: report.id,
    project_id: report.projectId,
    project_name: report.projectName,
    dept_name: report.deptName,
    reporter: {
      id: report.reporter.id,
      username: report.reporter.username,
      full_name: report.reporter.fullName,
      email: report.reporter.email,
    },
    reason: report.reason,
    details: report.details,
    status: report.status,
    created_at: report.createdAt,
  };
}

export const torReportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/tors/:projectId/reports',
    {
      onRequest: requireAuth,
      schema: {
        params: z.object({ projectId: z.string().min(1).max(100) }),
        body: CreateTorReportSchema,
        response: { 201: TorReportResponseSchema },
      },
    },
    async (request, reply) => {
      const report = await app.torReportService.submit(
        request.params.projectId,
        request.user.user_id,
        request.user.role,
        request.body,
      );
      return reply.code(201).send(toResponse(report));
    },
  );

  app.get(
    '/admin/tor-reports',
    {
      onRequest: requireAdmin,
      schema: {
        querystring: TorReportListQuerySchema,
        response: { 200: TorReportListResponseSchema },
      },
    },
    async (request) => {
      const { limit, offset } = request.query;
      const result = await app.torReportService.list(limit, offset);
      return { items: result.items.map(toResponse), total: result.total, limit, offset };
    },
  );
};
