import { testEnv } from './env';

/**
 * Renders `testEnv()`'s schema-valid fake config as a `.env` file, so a
 * throwaway environment (e.g. the ZAP baseline stack in CI) can boot without
 * a second, hand-maintained list of dummy credentials that drifts from
 * `EnvSchema` the next time a required field is added.
 */
const lines = Object.entries(testEnv())
  .filter(([, value]) => value !== undefined)
  .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`);

console.log(lines.join('\n'));
