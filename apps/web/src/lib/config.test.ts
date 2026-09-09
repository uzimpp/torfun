import { afterEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_API_URL = 'http://localhost:8080';

/**
 * `api_url` is read at module load, so each case needs a fresh module graph.
 */
async function load_api_url(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = value;
  }
  return (await import('./config')).api_url;
}

describe('api_url', () => {
  const original = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = original;
  });

  it('uses the configured origin when one is supplied', async () => {
    await expect(load_api_url('https://api.torfun.example')).resolves.toBe(
      'https://api.torfun.example',
    );
  });

  it('falls back to local development when nothing is configured', async () => {
    await expect(load_api_url(undefined)).resolves.toBe(DEFAULT_API_URL);
  });

  /**
   * A Docker build arg or a CI variable that resolves to nothing arrives as an
   * empty string, not as undefined. Inlined into the bundle that way, every
   * request would go to the web app's own origin instead of the API — a 404 at
   * runtime rather than a failure at build time.
   */
  it('falls back when the build supplies an empty origin', async () => {
    await expect(load_api_url('')).resolves.toBe(DEFAULT_API_URL);
  });
});
