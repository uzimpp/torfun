import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  NotificationListQuerySchema,
  NotificationListResponseSchema,
  NotificationPreferencesSchema,
  NotificationSettingsResponseSchema,
  NotificationMatchResponseSchema,
  NotificationDeliveryFailureResponseSchema,
  preferencesToDomain,
  preferencesToResponse,
  type Notification,
  type NotificationSettingsView,
} from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import { UnauthorizedError } from '../core/errors';

const Id = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) });
const Done = z.object({ ok: z.literal(true) });
const toResponse = (item: Notification) => ({
  id: item.id,
  project_id: item.projectId,
  project_name: item.projectName,
  event: item.event,
  score: item.score,
  reasons: item.reasons,
  previous_status: item.previousStatus,
  status: item.status,
  deadline_at: item.deadlineAt,
  read_at: item.readAt,
  created_at: item.createdAt,
});
const settingsResponse = (value: NotificationSettingsView) => ({
  preferences: preferencesToResponse(value.preferences),
  match_threshold: value.matchThreshold,
  email: value.email,
  email_verified: value.emailVerified,
  email_available: value.emailAvailable,
  line_available: value.lineAvailable,
  line_linked: value.lineLinked,
  line_connected: value.lineConnected,
  line_add_friend_url: value.lineAddFriendUrl,
});

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);
  app.get(
    '/notifications',
    {
      schema: {
        querystring: NotificationListQuerySchema,
        response: { 200: NotificationListResponseSchema },
      },
    },
    async (request) => {
      const result = await app.notificationService.list(request.user.user_id, request.query);
      return {
        items: result.items.map(toResponse),
        total: result.total,
        unread_count: result.unreadCount,
      };
    },
  );
  app.post('/notifications/read-all', { schema: { response: { 200: Done } } }, async (request) => {
    await app.notificationService.readAll(request.user.user_id);
    return { ok: true as const };
  });
  app.patch(
    '/notifications/:id',
    {
      schema: {
        params: Id,
        body: z.object({ action: z.enum(['read', 'dismiss']) }).strict(),
        response: { 200: Done },
      },
    },
    async (request) => {
      await app.notificationService.update(
        request.user.user_id,
        request.params.id,
        request.body.action,
      );
      return { ok: true as const };
    },
  );
  app.get(
    '/notifications/settings',
    { schema: { response: { 200: NotificationSettingsResponseSchema } } },
    async (request) =>
      settingsResponse(await app.notificationService.settings(request.user.user_id)),
  );
  app.put(
    '/notifications/settings',
    {
      schema: {
        body: NotificationPreferencesSchema,
        response: { 200: NotificationSettingsResponseSchema },
      },
    },
    async (request) =>
      settingsResponse(
        await app.notificationService.savePreferences(
          request.user.user_id,
          preferencesToDomain(request.body),
        ),
      ),
  );
  app.post(
    '/notifications/email',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        body: z.object({ email: z.string().trim().email().max(254) }).strict(),
        response: { 200: Done },
      },
    },
    async (request) => {
      await app.notificationService.requestEmail(request.user.user_id, request.body.email);
      return { ok: true as const };
    },
  );
  app.post(
    '/notifications/email/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
        response: { 200: NotificationSettingsResponseSchema },
      },
    },
    async (request) =>
      settingsResponse(
        await app.notificationService.verifyEmail(request.user.user_id, request.body.token),
      ),
  );
  app.delete(
    '/notifications/email',
    { schema: { response: { 200: NotificationSettingsResponseSchema } } },
    async (request) =>
      settingsResponse(await app.notificationService.disconnect(request.user.user_id, 'email')),
  );
  app.post(
    '/notifications/line/link',
    {
      schema: {
        body: z.object({ link_token: z.string().min(1).max(1000) }).strict(),
        response: { 200: z.object({ url: z.string().url() }) },
      },
    },
    async (request) => ({
      url: await app.lineNotificationService.beginLink(
        request.user.user_id,
        request.body.link_token,
      ),
    }),
  );
  app.delete(
    '/notifications/line',
    { schema: { response: { 200: NotificationSettingsResponseSchema } } },
    async (request) =>
      settingsResponse(await app.notificationService.disconnect(request.user.user_id, 'line')),
  );
  app.get(
    '/matching/:projectId',
    {
      schema: {
        params: z.object({ projectId: z.string().min(1).max(100) }),
        response: { 200: NotificationMatchResponseSchema },
      },
    },
    async (request) => {
      const match = await app.notificationService.match(
        request.user.user_id,
        request.params.projectId,
      );
      return {
        match: match
          ? {
              company_id: match.companyId,
              project_id: match.projectId,
              overall_score: match.overallScore,
              reasons: match.reasons,
              unmatched: match.unmatched,
              scoring_version: match.scoringVersion,
              input_version: match.inputVersion,
              computed_at: match.computedAt.toISOString(),
            }
          : null,
      };
    },
  );
  app.get(
    '/admin/notifications/deliveries',
    { schema: { response: { 200: z.array(NotificationDeliveryFailureResponseSchema) } } },
    async (request) =>
      (await app.notificationService.failures(request.user.user_id)).map((failure) => ({
        id: failure.id,
        channel: failure.channel,
        attempts: failure.attempts,
        error: failure.error,
        created_at: failure.createdAt,
        state: failure.state,
      })),
  );
  app.post(
    '/admin/notifications/deliveries/:id/retry',
    { schema: { params: Id, response: { 200: Done } } },
    async (request) => {
      await app.notificationService.retry(request.user.user_id, request.params.id);
      return { ok: true as const };
    },
  );
};

export const notificationWorkerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/internal/notifications/run',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      const supplied = request.headers['x-notification-worker-token'];
      const expected = Buffer.from(app.env.NOTIFICATION_WORKER_TOKEN);
      const actual = Buffer.from(typeof supplied === 'string' ? supplied : '');
      if (
        !expected.length ||
        actual.length !== expected.length ||
        !timingSafeEqual(expected, actual)
      )
        throw new UnauthorizedError();
      return app.notificationWorkerService.run();
    },
  );
};

export const lineWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  // This parser is scoped to the webhook plugin. Signature verification must
  // receive the exact UTF-8 body, before JSON parsing or reserialization.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  app.post('/notifications/line/webhook', async (request) => {
    const signature = request.headers['x-line-signature'];
    await app.lineNotificationService.webhook(
      request.body as string,
      typeof signature === 'string' ? signature : '',
    );
    return { ok: true };
  });
};
