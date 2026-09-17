import { buildApp } from './app';
import { loadEnv } from './config/env';

const env = loadEnv();
const app = await buildApp(env);

// Idempotent, and only ever needed against the real database — `buildApp()`
// itself must stay connection-free so a test can build an app with no Mongo
// reachable. A failure here (Mongo briefly unreachable at boot) is logged,
// not fatal: retrieval still works without the index, just slower.
try {
  await app.ingestionService.ensureIndexes();
} catch (err) {
  app.log.error({ err }, 'failed to ensure procurement indexes');
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
