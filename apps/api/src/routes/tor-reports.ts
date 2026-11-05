import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateTorReportSchema,
  TorReportListQuerySchema,
  TorReportListResponseSchema,
  TorReportResponseSchema,
  ReviewTorReportSchema,
  type ReportActor,
  type TorReport,
  type TorReportResponse,
} from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import { requireAdmin } from '../hooks/require-admin';

function actorResponse(actor: ReportActor) {
  return { id: actor.id, username: actor.username, full_name: actor.fullName, email: actor.email };
}

function toResponse(report: TorReport): TorReportResponse {
  const details = {
    id: report.id,
    project_id: report.projectId,
    project_name: report.projectName,
    dept_name: report.deptName,
    reporter: actorResponse(report.reporter),
    reason: report.reason,
    details: report.details,
    created_at: report.createdAt,
  };
  if (report.status === 'pending') return { ...details, status: report.status, review: null };
  return {
    ...details,
    status: report.status,
    review: {
      reviewer: actorResponse(report.review.reviewer),
      reviewed_at: report.review.reviewedAt,
      note: report.review.note,
    },
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
      const { limit, offset, status } = request.query;
      const result = await app.torReportService.list(request.user.user_id, limit, offset, status);
      return { items: result.items.map(toResponse), total: result.total, limit, offset };
    },
  );

  app.patch(
    '/admin/tor-reports/:reportId',
    {
      onRequest: requireAdmin,
      schema: {
        params: z.object({ reportId: z.string().regex(/^[a-f\d]{24}$/i) }),
        body: ReviewTorReportSchema,
        response: { 200: TorReportResponseSchema },
      },
    },
    async (request) =>
      toResponse(
        await app.torReportService.review(
          request.user.user_id,
          request.params.reportId,
          request.body,
        ),
      ),
  );
};
