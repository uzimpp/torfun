import '@fastify/jwt';
import type { OAuth2Namespace } from '@fastify/oauth2';
import type { Env } from '../config/env';
import type { MongoContext } from '../core/mongo';
import type { AuthService } from '../services/auth.service';
import type { IngestionService } from '../services/ingestion.service';
import type { UserRole } from '@torfun/types';

/** The JWT payload. snake_case is the on-the-wire claim shape. */
interface TokenClaims {
  user_id: string;
  username: string;
  role: UserRole;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenClaims;
    user: TokenClaims;
  }
}

declare module 'fastify' {
  /** Decorations wired up by the composition root in `app.ts`. */
  interface FastifyInstance {
    env: Env;
    googleOAuth2: OAuth2Namespace;
    mongo: MongoContext;
    authService: AuthService;
    ingestionService: IngestionService;
  }
}
