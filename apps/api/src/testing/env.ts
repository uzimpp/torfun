import type { z } from 'zod';
import { EnvSchema, type Env } from '../config/env';

/**
 * A valid `Env` for tests, built without touching `process.env`.
 *
 * Tests pass the result to `buildApp(env)`, so a run no longer depends on what
 * happens to be exported in the shell, in CI, or in a developer's local `.env`.
 * That used to matter: CI never set `EGP_API_KEY`, so the suite only passed
 * because a preloaded module patched `process.env` before validation ran.
 *
 * Overrides are raw strings, the same shape the real environment supplies, and
 * go through `EnvSchema` — so defaults and coercions behave exactly as they do
 * in production, and a test cannot construct an `Env` the schema would reject.
 */
const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/torfun-test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GOOGLE_OAUTH_CALLBACK_URL: 'http://localhost:8080/api/auth/google/callback',
  GOOGLE_CLOUD_PROJECT: 'torfun-test',
  EGP_API_KEY: 'test-egp-key',
} satisfies Partial<z.input<typeof EnvSchema>>;

export function testEnv(overrides: Partial<z.input<typeof EnvSchema>> = {}): Env {
  return EnvSchema.parse({ ...BASE_ENV, ...overrides });
}
