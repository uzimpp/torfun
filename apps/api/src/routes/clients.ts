import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ClientKind, type Client } from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';

/**
 * HTTP surface for a Company's Clients.
 *
 * Every route requires a session and none of them names a Company: the scope
 * is the caller's own, resolved from the signed-in account inside the service.
 * A `:id` here is always read *within* that scope, so an id belonging to
 * another vendor comes back 404 — indistinguishable from one that never
 * existed, which is deliberate.
 */

const ClientResponse = z.object({
  id: z.string(),
  name: z.string(),
  kind: ClientKind,
});

function toClientResponse(client: Client) {
  return { id: client.id, name: client.name, kind: client.kind };
}

const NameField = z.string().trim().min(1).max(200);

export const clientRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/clients',
    {
      schema: { response: { 200: z.object({ clients: z.array(ClientResponse) }) } },
    },
    async (request) => {
      const clients = await app.clientService.list(request.user.user_id);
      return { clients: clients.map(toClientResponse) };
    },
  );

  /**
   * Declared before `/clients/:id` reads naturally, though the router prefers a
   * static segment over a parameter regardless of registration order.
   */
  app.get(
    '/clients/suggestions',
    {
      schema: {
        querystring: z.object({ kind: ClientKind, q: z.string().default('') }),
        // A flat array of names, not objects: a suggestion is a string the
        // officer is about to type, and the Client it may become does not
        // exist yet.
        response: { 200: z.object({ suggestions: z.array(z.string()) }) },
      },
    },
    async (request) => {
      const suggestions = await app.clientService.suggestions(
        request.user.user_id,
        request.query.kind,
        request.query.q,
      );
      return { suggestions };
    },
  );

  app.post(
    '/clients',
    {
      schema: {
        body: z.object({ name: NameField, kind: ClientKind }),
        response: { 201: ClientResponse, 409: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      const client = await app.clientService.create(request.user.user_id, request.body);
      return reply.code(201).send(toClientResponse(client));
    },
  );

  app.patch(
    '/clients/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({ name: NameField.optional(), kind: ClientKind.optional() }),
        response: { 200: ClientResponse, 404: z.object({ message: z.string() }) },
      },
    },
    async (request) => {
      const client = await app.clientService.update(
        request.user.user_id,
        request.params.id,
        request.body,
      );
      return toClientResponse(client);
    },
  );

  app.delete(
    '/clients/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
          // Work recorded against this client. A cascade would destroy the
          // record the feature exists to build, so the officer is told instead.
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      await app.clientService.remove(request.user.user_id, request.params.id);
      return reply.code(204).send(null);
    },
  );
};
