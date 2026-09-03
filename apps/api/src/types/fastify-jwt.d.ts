import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      user_id: string;
      username: string;
      role: 'USER' | 'ADMIN';
    };
    user: {
      user_id: string;
      username: string;
      role: 'USER' | 'ADMIN';
    };
  }
}
