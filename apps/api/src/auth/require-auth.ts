import type { FastifyReply, FastifyRequest } from 'fastify';

export async function require_auth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({
      message: 'Authentication required',
    });
  }
}
