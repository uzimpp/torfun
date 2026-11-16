import type { FastifyError, FastifyInstance } from 'fastify';

/**
 * Domain errors.
 *
 * Services throw these; they never build a status code or touch a reply. The
 * handler registered below is the only place in the codebase that maps a
 * failure onto HTTP, which is what keeps the service layer framework-free and
 * unit-testable without booting a server.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    /** Optional structured payload, surfaced as `errors` in the response. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
    this.name = 'TooManyRequestsError';
  }
}

/**
 * Central error handler. Every error response in the API is `{ message }`,
 * optionally with `errors` for validation detail — the shape the web client
 * already reads in `apps/web/src/lib/api.ts`.
 */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler<AppError | FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      // Expected outcomes (bad login, duplicate username): not log-worthy at
      // error level, or a scripted login attempt would flood the logs.
      request.log.debug({ err: error }, 'request rejected');
      return reply
        .code(error.statusCode)
        .send(
          error.details === undefined
            ? { message: error.message }
            : { message: error.message, errors: error.details },
        );
    }

    // Schema validation from fastify-type-provider-zod arrives with a
    // statusCode already set; anything else is a genuine bug.
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error');
      return reply.code(statusCode).send({ message: 'Internal server error' });
    }

    return reply.code(statusCode).send({ message: error.message });
  });
}
