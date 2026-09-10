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

/**
 * Both origins are read at module load, so each case needs a fresh module graph
 * for the same reason `load_api_url` does.
 */
async function load_internal_api_url(internal: string | undefined, browser: string | undefined) {
  vi.resetModules();
  if (browser === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = browser;
  if (internal === undefined) delete process.env.INTERNAL_API_URL;
  else process.env.INTERNAL_API_URL = internal;
  return (await import('./config')).internal_api_url;
}

describe('internal_api_url', () => {
  const original_browser = process.env.NEXT_PUBLIC_API_URL;
  const original_internal = process.env.INTERNAL_API_URL;

  afterEach(() => {
    if (original_browser === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = original_browser;
    if (original_internal === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = original_internal;
  });

  /**
   * The case this exists for. In Docker the browser reaches the API on the
   * published host port, while server-side rendering runs inside the web
   * container — where that same address is the container itself, with nothing
   * listening on it.
   */
  it('prefers the server-side origin when the container supplies one', async () => {
    await expect(load_internal_api_url('http://api:8080', 'http://localhost:8080')).resolves.toBe(
      'http://api:8080',
    );
  });

  it('falls back to the browser origin when both halves share a network', async () => {
    await expect(load_internal_api_url(undefined, 'https://api.torfun.example')).resolves.toBe(
      'https://api.torfun.example',
    );
  });

  /** Same empty-string trap as above: an unset Compose variable arrives as ''. */
  it('falls back when the container supplies an empty origin', async () => {
    await expect(load_internal_api_url('', 'https://api.torfun.example')).resolves.toBe(
      'https://api.torfun.example',
    );
  });
});
