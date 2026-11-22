import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AutoApproveDomain,
  JoinOutcome,
  ThaiCompanyName,
  Tin,
  type Company,
  type User,
} from '@torfun/types';
import { audit } from '../core/audit';
import { requireAuth } from '../hooks/require-auth';

/**
 * HTTP surface for the vendor's own record and who belongs to it.
 *
 * Every route here requires a session, enforced once for the plugin scope, and
 * **none of them accepts a company id the caller chose to act as** — `/me`
 * resolves the Company from the signed-in account. `:id` appears exactly once,
 * on `join`, where naming another Company is the entire operation, and joining
 * is now only a request until a Company Manager approves it (pentest P-1).
 *
 * The rules — who may approve, the last-manager guard, the domain check — live
 * in `CompanyMembershipService`; this file shapes the wire and writes the audit
 * trail.
 *
 * The Thai name rule arrives from `@torfun/types` rather than being restated
 * here, so the API and the web app cannot drift into two definitions of what a
 * company name is.
 */

const Message = z.object({ message: z.string() });

/** What anyone signed in may learn about a Company: enough to pick it, no more. */
const CompanySummary = z.object({
  id: z.string(),
  name_th: z.string(),
  tin: z.string().nullable(),
});

/** The caller's own Company, with their standing in it. */
const MyCompany = CompanySummary.extend({
  is_manager: z.boolean(),
  auto_approve_domain: z.string().nullable(),
});

const Member = z.object({
  id: z.string(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  is_manager: z.boolean(),
});

const JoinRequest = z.object({
  user_id: z.string(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  /** Shown so a manager can tell a colleague from a stranger with the same name. */
  email: z.string().nullable(),
  requested_at: z.string(),
});

/** snake_case on the wire; the domain object stays camelCase. */
function toSummary(company: Company) {
  return { id: company.id, name_th: company.nameTh, tin: company.tin };
}

function toMyCompany(company: Company, isManager: boolean) {
  return {
    ...toSummary(company),
    is_manager: isManager,
    auto_approve_domain: company.autoApproveDomain,
  };
}

function toJoinRequest(user: User) {
  return {
    user_id: user.id,
    username: user.username,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email ?? null,
    requested_at: (user.joinRequest?.requestedAt ?? user.updatedAt).toISOString(),
  };
}

const CreateBody = z.object({
  name_th: ThaiCompanyName,
  tin: Tin.optional(),
});

const PatchBody = z.object({
  name_th: ThaiCompanyName.optional(),
  tin: Tin.nullable().optional(),
});

const UserParams = z.object({ userId: z.string() });

export const companyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  const membership = app.companyMembershipService;

  app.get(
    '/companies/search',
    {
      schema: {
        querystring: z.object({ q: z.string().max(200).default('') }),
        response: { 200: z.object({ companies: z.array(CompanySummary) }) },
      },
    },
    async (request) => {
      const companies = await app.companyService.search(request.query.q);
      return { companies: companies.map(toSummary) };
    },
  );

  app.post(
    '/companies',
    {
      schema: {
        body: CreateBody,
        response: { 201: MyCompany },
      },
    },
    async (request, reply) => {
      const company = await app.companyService.createAndJoin(request.user.user_id, {
        nameTh: request.body.name_th,
        tin: request.body.tin ?? null,
      });
      audit(request.log, 'company.created', {
        ip: request.ip,
        userId: request.user.user_id,
        companyId: company.id,
      });
      return reply.code(201).send(toMyCompany(company, true));
    },
  );

  app.get(
    '/companies/me',
    {
      schema: {
        response: { 200: MyCompany, 404: Message },
      },
    },
    async (request) => {
      const { company, isManager } = await app.companyService.mine(request.user.user_id);
      return toMyCompany(company, isManager);
    },
  );

  app.patch(
    '/companies/me',
    {
      schema: {
        body: PatchBody,
        response: { 200: MyCompany, 403: Message, 404: Message },
      },
    },
    async (request) => {
      const company = await app.companyService.updateMine(request.user.user_id, {
        ...(request.body.name_th !== undefined ? { nameTh: request.body.name_th } : {}),
        ...(request.body.tin !== undefined ? { tin: request.body.tin } : {}),
      });
      return toMyCompany(company, true);
    },
  );

  /**
   * 200 when the caller is in (already a member, or their verified email is at
   * the Company's auto-approve domain); 202 when a manager has to decide.
   */
  app.post(
    '/companies/:id/join',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          200: z.object({ outcome: z.literal(JoinOutcome.enum.joined), company: MyCompany }),
          202: z.object({ outcome: z.literal(JoinOutcome.enum.pending), company: CompanySummary }),
          403: Message,
          404: Message,
          409: Message,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.user_id;
      const { outcome, company } = await membership.requestToJoin(userId, request.params.id);
      audit(
        request.log,
        outcome === 'joined' ? 'company.join.auto_approved' : 'company.join.requested',
        {
          ip: request.ip,
          userId,
          companyId: company.id,
        },
      );
      if (outcome === 'joined') {
        return reply.code(200).send({ outcome, company: toMyCompany(company, false) });
      }
      return reply.code(202).send({ outcome, company: toSummary(company) });
    },
  );

  /** The caller's own request that no manager has answered yet. */
  app.get(
    '/companies/join-request',
    {
      schema: {
        response: {
          200: z.object({ company: CompanySummary, requested_at: z.string() }),
          404: Message,
        },
      },
    },
    async (request, reply) => {
      const pending = await membership.pendingRequest(request.user.user_id);
      if (!pending) return reply.code(404).send({ message: 'No pending join request' });
      return {
        company: toSummary(pending.company),
        requested_at: pending.requestedAt.toISOString(),
      };
    },
  );

  app.delete('/companies/join-request', async (request, reply) => {
    await membership.withdrawRequest(request.user.user_id);
    audit(request.log, 'company.join.withdrawn', { ip: request.ip, userId: request.user.user_id });
    return reply.code(204).send();
  });

  app.get(
    '/companies/me/members',
    {
      schema: {
        response: { 200: z.object({ members: z.array(Member) }), 404: Message },
      },
    },
    async (request) => ({
      members: (await membership.members(request.user.user_id)).map(({ user, isManager }) => ({
        id: user.id,
        username: user.username,
        first_name: user.firstName,
        last_name: user.lastName,
        is_manager: isManager,
      })),
    }),
  );

  app.get(
    '/companies/me/join-requests',
    {
      schema: {
        response: { 200: z.object({ requests: z.array(JoinRequest) }), 403: Message, 404: Message },
      },
    },
    async (request) => ({
      requests: (await membership.joinRequests(request.user.user_id)).map(toJoinRequest),
    }),
  );

  app.post(
    '/companies/me/join-requests/:userId/approve',
    { schema: { params: UserParams } },
    async (request, reply) => {
      const { company, applicant } = await membership.approve(
        request.user.user_id,
        request.params.userId,
      );
      audit(request.log, 'company.join.approved', {
        ip: request.ip,
        userId: request.user.user_id,
        targetUserId: applicant.id,
        companyId: company.id,
      });
      return reply.code(204).send();
    },
  );

  app.post(
    '/companies/me/join-requests/:userId/reject',
    { schema: { params: UserParams } },
    async (request, reply) => {
      const { company, applicant } = await membership.reject(
        request.user.user_id,
        request.params.userId,
      );
      audit(request.log, 'company.join.rejected', {
        ip: request.ip,
        userId: request.user.user_id,
        targetUserId: applicant.id,
        companyId: company.id,
      });
      return reply.code(204).send();
    },
  );

  /** `domain: null` turns automatic approval off. */
  app.put(
    '/companies/me/auto-approve',
    {
      schema: {
        body: z.object({ domain: AutoApproveDomain.nullable() }),
        response: { 200: MyCompany, 403: Message, 404: Message },
      },
    },
    async (request) => {
      const company = await membership.setAutoApproveDomain(
        request.user.user_id,
        request.body.domain,
      );
      audit(request.log, 'company.settings.changed', {
        ip: request.ip,
        userId: request.user.user_id,
        companyId: company.id,
        autoApproveDomain: company.autoApproveDomain,
      });
      return toMyCompany(company, true);
    },
  );

  app.put(
    '/companies/me/members/:userId/manager',
    { schema: { params: UserParams, body: z.object({ is_manager: z.boolean() }) } },
    async (request, reply) => {
      const { company, member } = await membership.setManager(
        request.user.user_id,
        request.params.userId,
        request.body.is_manager,
      );
      audit(request.log, 'company.manager.changed', {
        ip: request.ip,
        userId: request.user.user_id,
        targetUserId: member.id,
        companyId: company.id,
        isManager: request.body.is_manager,
      });
      return reply.code(204).send();
    },
  );

  app.delete(
    '/companies/me/members/:userId',
    { schema: { params: UserParams } },
    async (request, reply) => {
      const { company, member } = await membership.removeMember(
        request.user.user_id,
        request.params.userId,
      );
      audit(request.log, 'company.member.removed', {
        ip: request.ip,
        userId: request.user.user_id,
        targetUserId: member.id,
        companyId: company.id,
      });
      return reply.code(204).send();
    },
  );
};
