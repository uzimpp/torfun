import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  CompanyQualificationsPayloadSchema,
  fromCompanyQualificationsPayload,
  toCompanyQualificationsPayload,
} from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';

export const companyQualificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
  });

  app.get(
    '/companies/me/qualifications',
    {
      schema: { response: { 200: CompanyQualificationsPayloadSchema.nullable() } },
    },
    async (request) => {
      const profile = await app.companyQualificationsService.get(request.user.user_id);
      return profile ? toCompanyQualificationsPayload(profile) : null;
    },
  );

  app.post(
    '/companies/me/qualifications',
    {
      schema: {
        body: CompanyQualificationsPayloadSchema,
        response: { 200: CompanyQualificationsPayloadSchema },
      },
    },
    async (request) => {
      const profile = await app.companyQualificationsService.replace(
        request.user.user_id,
        fromCompanyQualificationsPayload(request.body),
      );
      return toCompanyQualificationsPayload(profile);
    },
  );
};
