import type { FastifyReply, FastifyRequest } from 'fastify';
import { require_auth } from './require-auth';

export async function require_admin(request: FastifyRequest, reply: FastifyReply) {
  await require_auth(request, reply);

  if (reply.sent) {
    return;
  }

  if (request.user.role !== 'ADMIN') {
    return reply.code(403).send({
      message: 'Admin access required',
    });
  }
}
