import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ThaiCompanyName, Tin, type Company } from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';

/**
 * HTTP surface for the vendor's own record.
 *
 * Every route here requires a session, enforced once for the plugin scope, and
 * **none of them accepts a company id the caller chose to act as** — `/me`
 * resolves the Company from the signed-in account. `:id` appears exactly once,
 * on `join`, where naming another Company is the entire operation.
 *
 * The Thai name rule arrives from `@torfun/types` rather than being restated
 * here, so the API and the web app cannot drift into two definitions of what a
 * company name is.
 */

const CompanyResponse = z.object({
  id: z.string(),
  name_th: z.string(),
  tin: z.string().nullable(),
});

/** snake_case on the wire; the domain object stays camelCase. */
function toCompanyResponse(company: Company) {
  return { id: company.id, name_th: company.nameTh, tin: company.tin };
}

const CreateBody = z.object({
  name_th: ThaiCompanyName,
  tin: Tin.optional(),
});

const PatchBody = z.object({
  name_th: ThaiCompanyName.optional(),
  tin: Tin.nullable().optional(),
});

export const companyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/companies/search',
    {
      schema: {
        querystring: z.object({ q: z.string().default('') }),
        response: { 200: z.object({ companies: z.array(CompanyResponse) }) },
      },
    },
    async (request) => {
      const companies = await app.companyService.search(request.query.q);
      return { companies: companies.map(toCompanyResponse) };
    },
  );

  app.post(
    '/companies',
    {
      schema: {
        body: CreateBody,
        response: { 201: CompanyResponse },
      },
    },
    async (request, reply) => {
      const company = await app.companyService.createAndJoin(request.user.user_id, {
        nameTh: request.body.name_th,
        tin: request.body.tin ?? null,
      });
      return reply.code(201).send(toCompanyResponse(company));
    },
  );

  app.get(
    '/companies/me',
    {
      schema: {
        response: { 200: CompanyResponse, 404: z.object({ message: z.string() }) },
      },
    },
    async (request) => toCompanyResponse(await app.companyService.mine(request.user.user_id)),
  );

  app.patch(
    '/companies/me',
    {
      schema: {
        body: PatchBody,
        response: { 200: CompanyResponse, 404: z.object({ message: z.string() }) },
      },
    },
    async (request) => {
      const company = await app.companyService.updateMine(request.user.user_id, {
        ...(request.body.name_th !== undefined ? { nameTh: request.body.name_th } : {}),
        ...(request.body.tin !== undefined ? { tin: request.body.tin } : {}),
      });
      return toCompanyResponse(company);
    },
  );

  app.post(
    '/companies/:id/join',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: CompanyResponse, 404: z.object({ message: z.string() }) },
      },
    },
    async (request) => {
      const company = await app.companyService.join(request.user.user_id, request.params.id);
      return toCompanyResponse(company);
    },
  );
};
