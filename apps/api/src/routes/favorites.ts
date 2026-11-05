import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProcurementSchema, type Favorite, type Procurement } from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';

/**
 * HTTP surface for an officer's favorited Procurements.
 *
 * Every route requires a session and none of them names a user: the scope is
 * the caller's own, resolved from the signed-in account inside the service.
 */

const FavoriteResponse = z.object({
  project_id: z.string(),
  favorited_at: z.coerce.date(),
  procurement: ProcurementSchema,
});

function toFavoriteResponse(favorite: Favorite, procurement: Procurement) {
  return {
    project_id: favorite.projectId,
    favorited_at: favorite.createdAt,
    procurement,
  };
}

export const favoriteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/favorites',
    {
      schema: { response: { 200: z.object({ favorites: z.array(FavoriteResponse) }) } },
    },
    async (request) => {
      const entries = await app.favoriteService.list(request.user.user_id);
      return {
        favorites: entries.map(({ favorite, procurement }) =>
          toFavoriteResponse(favorite, procurement),
        ),
      };
    },
  );

  app.get(
    '/favorites/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        response: { 200: z.object({ favorited: z.boolean() }) },
      },
    },
    async (request) => ({
      favorited: await app.favoriteService.isFavorited(
        request.user.user_id,
        request.params.projectId,
      ),
    }),
  );

  app.post(
    '/favorites',
    {
      schema: {
        body: z.object({ project_id: z.string().min(1) }),
        response: { 201: FavoriteResponse, 404: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      const { favorite, procurement } = await app.favoriteService.add(
        request.user.user_id,
        request.body.project_id,
      );
      return reply.code(201).send(toFavoriteResponse(favorite, procurement));
    },
  );

  app.delete(
    '/favorites/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1) }),
        response: { 204: z.null(), 404: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      await app.favoriteService.remove(request.user.user_id, request.params.projectId);
      return reply.code(204).send(null);
    },
  );
};
