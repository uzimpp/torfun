import { MongoClient, type Db } from 'mongodb';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';

/**
 * Mongo connection lifecycle, owned by the app instance rather than by module
 * scope.
 *
 * The connection stays lazy: constructing the client is cheap and offline, so
 * `buildApp()` — and therefore every test that injects a request — works
 * without a reachable database. The first query is what actually connects.
 */
export interface MongoContext {
  getDb: () => Promise<Db>;
}

export function registerMongo(app: FastifyInstance, env: Env) {
  const client = new MongoClient(env.MONGODB_URI);
  let connecting: Promise<Db> | undefined;

  const getDb = () => (connecting ??= client.connect().then((connected) => connected.db()));

  app.decorate('mongo', { getDb });
  app.addHook('onClose', async () => {
    await client.close();
  });
}
