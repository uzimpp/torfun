import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TombstoneSchema } from '@torfun/types';
import { requireAdmin } from '../hooks/require-admin';

/**
 * What a Site Administrator does to a procurement or a tombstone: overrule the
 * model, delete, or lift a drop.
 *
 * Admin-only, and deliberately outside the audience rule: these act on records
 * an officer may not see, so there is no audience to narrow by. Who acted is the
 * session's username and nothing a caller can send. The held list is not here —
 * it is the ordinary list, filtered to `outcome=needs_review`.
 */

const Message = z.object({ message: z.string() });
const ProjectParams = z.object({ projectId: z.string() });
const notFoundOrConflict = { 404: Message, 409: Message };

export const procurementAdminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin);

  app.post(
    '/ingestion/procurements/:projectId/approve',
    {
      schema: { params: ProjectParams, response: { 204: z.null(), ...notFoundOrConflict } },
    },
    async (request, reply) => {
      await app.procurementAdminService.approve(request.params.projectId, request.user.username);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/ingestion/procurements/:projectId/non-software',
    { schema: { params: ProjectParams, response: { 204: z.null(), 404: Message } } },
    async (request, reply) => {
      await app.procurementAdminService.markNonSoftware(
        request.params.projectId,
        request.user.username,
      );
      return reply.code(204).send(null);
    },
  );

  app.delete(
    '/ingestion/procurements/:projectId',
    {
      schema: {
        params: ProjectParams,
        // Required, and only `true` or `false`: whether the runner may pull the
        // project again is the administrator's decision, never a default.
        querystring: z.object({ allowReimport: z.enum(['true', 'false']) }),
        response: { 204: z.null(), 404: Message },
      },
    },
    async (request, reply) => {
      await app.procurementAdminService.deleteProcurement(
        request.params.projectId,
        request.user.username,
        { allowReimport: request.query.allowReimport === 'true' },
      );
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/ingestion/tombstones',
    { schema: { response: { 200: z.object({ items: z.array(TombstoneSchema) }) } } },
    async () => ({ items: await app.procurementAdminService.tombstones() }),
  );

  app.delete(
    '/ingestion/tombstones/:projectId',
    { schema: { params: ProjectParams, response: { 204: z.null(), 404: Message } } },
    async (request, reply) => {
      await app.procurementAdminService.removeTombstone(
        request.params.projectId,
        request.user.username,
      );
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/ingestion/tombstones/:projectId/restore',
    {
      schema: {
        params: ProjectParams,
        response: { 202: z.object({ started: z.literal(true) }), ...notFoundOrConflict },
      },
    },
    async (request, reply) => {
      await app.procurementAdminService.restoreTombstone(
        request.params.projectId,
        request.user.username,
      );
      return reply.code(202).send({ started: true as const });
    },
  );
};
