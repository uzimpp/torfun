import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { displayDuration, DurationUnit, TargetPlatform, type Experience } from '@torfun/types';
import { requireAuth } from '../hooks/require-auth';
import type { DurationInput } from '../services/experience.service';

/**
 * HTTP surface for the work a Company has delivered.
 *
 * Session-only and company-scoped, like `clients.ts`: nothing here names a
 * Company, and an id outside the caller's own scope is a 404.
 *
 * A duration crosses this boundary three times over — `duration_value` and
 * `duration_unit` are what the person typed, `duration_months` is what was
 * stored. All three go out so the page can show back "2 years" without doing
 * arithmetic of its own, and so the conversion stays in one place
 * (`toDurationMonths`, via the service).
 */

const ExperienceResponse = z.object({
  id: z.string(),
  client_id: z.string(),
  project_name: z.string(),
  description: z.string().nullable(),
  tech_stack: z.array(z.string()),
  target_platforms: z.array(TargetPlatform),
  duration_value: z.number().nullable(),
  duration_unit: DurationUnit.nullable(),
  duration_months: z.number().nullable(),
});

function toExperienceResponse(experience: Experience) {
  const shown = displayDuration(experience.durationMonths, experience.durationUnit);
  return {
    id: experience.id,
    client_id: experience.clientId,
    project_name: experience.projectName,
    description: experience.description,
    tech_stack: experience.techStack,
    target_platforms: experience.targetPlatforms,
    duration_value: shown?.value ?? null,
    duration_unit: shown?.unit ?? null,
    duration_months: experience.durationMonths,
  };
}

/**
 * A length is a pair or it is nothing. Fifty years of anything is already
 * implausible, and the cap keeps a typo out of a number a later score divides
 * by.
 */
const durationFields = {
  duration_value: z.number().int().positive().max(600).nullable().optional(),
  duration_unit: DurationUnit.nullable().optional(),
};

type DurationBody = {
  duration_value?: number | null;
  duration_unit?: DurationUnit | null;
};

const bothOrNeither = (body: DurationBody) =>
  ((body.duration_value ?? null) === null) === ((body.duration_unit ?? null) === null);

const DURATION_MESSAGE = 'duration_value and duration_unit must be given together';

/**
 * `undefined` leaves a stored length alone on a PATCH; `null` clears it. The
 * difference is the whole reason this is not just a nullish coalesce.
 */
function readDuration(body: DurationBody): DurationInput | null | undefined {
  if (body.duration_value === undefined && body.duration_unit === undefined) return undefined;
  const value = body.duration_value ?? null;
  const unit = body.duration_unit ?? null;
  if (value === null || unit === null) return null;
  return { value, unit };
}

const CreateBody = z
  .object({
    client_id: z.string().min(1),
    project_name: z.string().trim().min(1).max(300),
    description: z.string().max(2000).nullable().optional(),
    tech_stack: z.array(z.string().trim().min(1)).optional(),
    target_platforms: z.array(TargetPlatform).optional(),
    ...durationFields,
  })
  .refine(bothOrNeither, { message: DURATION_MESSAGE, path: ['duration_unit'] });

const PatchBody = z
  .object({
    client_id: z.string().min(1).optional(),
    project_name: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(2000).nullable().optional(),
    tech_stack: z.array(z.string().trim().min(1)).optional(),
    target_platforms: z.array(TargetPlatform).optional(),
    ...durationFields,
  })
  .refine(bothOrNeither, { message: DURATION_MESSAGE, path: ['duration_unit'] });

export const experienceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/experiences',
    {
      schema: { response: { 200: z.object({ experiences: z.array(ExperienceResponse) }) } },
    },
    async (request) => {
      const experiences = await app.experienceService.list(request.user.user_id);
      return { experiences: experiences.map(toExperienceResponse) };
    },
  );

  app.post(
    '/experiences',
    {
      schema: {
        body: CreateBody,
        response: {
          201: ExperienceResponse,
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const experience = await app.experienceService.create(request.user.user_id, {
        clientId: body.client_id,
        projectName: body.project_name,
        description: body.description ?? null,
        techStack: body.tech_stack ?? [],
        targetPlatforms: body.target_platforms ?? [],
        duration: readDuration(body) ?? null,
      });
      return reply.code(201).send(toExperienceResponse(experience));
    },
  );

  app.patch(
    '/experiences/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: PatchBody,
        response: {
          200: ExperienceResponse,
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request) => {
      const body = request.body;
      const duration = readDuration(body);
      const experience = await app.experienceService.update(
        request.user.user_id,
        request.params.id,
        {
          ...(body.client_id !== undefined ? { clientId: body.client_id } : {}),
          ...(body.project_name !== undefined ? { projectName: body.project_name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.tech_stack !== undefined ? { techStack: body.tech_stack } : {}),
          ...(body.target_platforms !== undefined
            ? { targetPlatforms: body.target_platforms }
            : {}),
          ...(duration !== undefined ? { duration } : {}),
        },
      );
      return toExperienceResponse(experience);
    },
  );

  app.delete(
    '/experiences/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: {
          204: z.null(),
          404: z.object({ message: z.string() }),
          409: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      await app.experienceService.remove(request.user.user_id, request.params.id);
      return reply.code(204).send(null);
    },
  );
};
