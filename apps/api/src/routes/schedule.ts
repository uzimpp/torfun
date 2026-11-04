import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ScheduleUpdateSchema, ScheduleViewSchema } from '@torfun/types';
import { requireAdmin } from '../hooks/require-admin';

/**
 * When Runs start on their own — administrators only.
 *
 * The Schedule decides how much this system asks of a rate-limited upstream in
 * a day, so nobody else reads or changes it. In its own plugin, beside
 * `/ingestion/*` in the URL space but not in the file, so the queue and
 * diagnostics routes stay a separate concern.
 *
 * The body is only the setting. Who saved it and when are read from the session
 * and the clock here, never from the request, so neither can be forged.
 */
export const scheduleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/ingestion/schedule',
    {
      onRequest: requireAdmin,
      schema: { response: { 200: ScheduleViewSchema } },
    },
    async () => app.scheduleService.get(),
  );

  app.put(
    '/ingestion/schedule',
    {
      onRequest: requireAdmin,
      schema: { body: ScheduleUpdateSchema, response: { 200: ScheduleViewSchema } },
    },
    async (request) => app.scheduleService.update(request.body, request.user.user_id),
  );
};
