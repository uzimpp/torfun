import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SourceAgencyEditSchema,
  SourceAgencyInputSchema,
  SourceDeptIdSchema,
  SourceRegistryViewSchema,
} from '@torfun/types';
import { requireAdmin } from '../hooks/require-admin';

/**
 * The Source Registry: which agencies Discovery reads (FR-40). Administrators
 * only, enforced once for the plugin scope. Changes take effect at the next Run;
 * a Run already going keeps the list it started with, and nothing already
 * ingested is touched.
 *
 * Who made a change is read from the session, never from the body.
 */
export const sourceRegistryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAdmin);

  const message = z.object({ message: z.string() });

  app.get(
    '/ingestion/sources',
    { schema: { response: { 200: SourceRegistryViewSchema } } },
    async () => app.sourceRegistryService.get(),
  );

  app.post(
    '/ingestion/sources',
    {
      schema: {
        body: SourceAgencyInputSchema,
        response: { 201: SourceRegistryViewSchema, 409: message },
      },
    },
    async (request, reply) =>
      reply.code(201).send(await app.sourceRegistryService.add(request.body, request.user.user_id)),
  );

  app.put(
    '/ingestion/sources/:deptId',
    {
      schema: {
        params: z.object({ deptId: SourceDeptIdSchema }),
        body: SourceAgencyEditSchema,
        response: { 200: SourceRegistryViewSchema, 404: message },
      },
    },
    async (request) =>
      app.sourceRegistryService.edit(request.params.deptId, request.body, request.user.user_id),
  );

  app.delete(
    '/ingestion/sources/:deptId',
    {
      schema: {
        params: z.object({ deptId: SourceDeptIdSchema }),
        response: { 200: SourceRegistryViewSchema, 404: message },
      },
    },
    async (request) =>
      app.sourceRegistryService.remove(request.params.deptId, request.user.user_id),
  );
};
