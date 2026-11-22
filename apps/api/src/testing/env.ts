import type { z } from 'zod';
import { EnvSchema, type Env } from '../config/env';

/**
 * A valid `Env` for tests, built without touching `process.env`.
 *
 * Tests pass the result to `buildApp(env)`, so a run does not depend on what is
 * exported in the shell, in CI, or in a developer's local `.env`.
 *
 * Overrides are raw strings, the same shape the real environment supplies, and
 * go through `EnvSchema`. Defaults and coercions behave as they do in
 * production, and a test cannot construct an `Env` the schema would reject.
 */
const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/torfun-test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_OAUTH_CALLBACK_URL: 'http://localhost:8080/api/auth/google/callback',
  GOOGLE_CLOUD_PROJECT: 'torfun-test',
  EGP_API_KEY: 'test-egp-key',
  // Tests never reach the network.
  BREACHED_PASSWORD_CHECK: 'false',
} satisfies Partial<z.input<typeof EnvSchema>>;

export function testEnv(overrides: Partial<z.input<typeof EnvSchema>> = {}): Env {
  return EnvSchema.parse({ ...BASE_ENV, ...overrides });
}
