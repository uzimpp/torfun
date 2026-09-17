import { POLITENESS } from './constants';

/**
 * HTTP helpers for the two upstream systems.
 *
 * Both are third-party government services we don't control, so every call
 * here treats a malformed or unexpected response as a first-class outcome
 * rather than trusting the shape.
 */

export class RateLimitedError extends Error {
  constructor(url: string, status: number) {
    super(`HTTP ${status} from ${url} — treating as rate limited`);
    this.name = 'RateLimitedError';
  }
}

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Uniformly-distributed delay inside the configured politeness range. */
export function politeTorDelayMs(): number {
  const [min, max] = POLITENESS.torDelayMsRange;
  return min + Math.random() * (max - min);
}

function buildUrl(base: string, params: Record<string, string | number>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * A GET with bounded retries and an explicit rate-limit signal.
 *
 * 429/403 throws RateLimitedError immediately and is never retried: the whole
 * point is to back off the site rather than hammer it. 5xx is retried, since
 * that's the upstream having a bad moment rather than refusing us.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let lastError = 'unknown failure';

  for (let attempt = 0; attempt <= POLITENESS.maxRetries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.status === 429 || response.status === 403) {
        throw new RateLimitedError(url, response.status);
      }
      if (response.status >= 500) {
        lastError = `HTTP ${response.status}`;
      } else if (!response.ok) {
        throw new UpstreamError(`HTTP ${response.status} from ${url}`);
      } else {
        return response;
      }
    } catch (error) {
      if (error instanceof RateLimitedError || error instanceof UpstreamError) throw error;
      lastError = `transport error: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (attempt < POLITENESS.maxRetries) {
      await sleep(POLITENESS.retryBackoffMs[attempt] ?? 5000);
    }
  }

  throw new UpstreamError(lastError);
}

/** Envelope the open-data API wraps every response in. */
interface OpenDataEnvelope<T> {
  success?: boolean;
  message?: string;
  total?: number;
  data?: T[];
}

/**
 * GET against an open-data `/service/<name>` endpoint.
 *
 * Throws rather than returning null: callers decide whether a given failure
 * aborts the run or just gets logged, and a silent null would let a broken
 * page look like an empty one.
 */
export async function openDataGet<T>(
  endpoint: string,
  params: Record<string, string | number>,
  apiKey: string,
): Promise<{ rows: T[]; total: number }> {
  const url = buildUrl(endpoint, { ...params, 'api-key': apiKey });
  const response = await fetchWithRetry(url, {}, POLITENESS.openDataTimeoutMs);

  let body: OpenDataEnvelope<T>;
  try {
    body = (await response.json()) as OpenDataEnvelope<T>;
  } catch {
    // The broken /govspending/egpdepartment and /cgdcontract paths answer 200
    // with a Drupal HTML 404 page, so a non-JSON body is a real, seen failure.
    throw new UpstreamError(`Non-JSON response body from ${endpoint}`);
  }

  if (body.success === false) {
    throw new UpstreamError(`API returned success=false: ${body.message ?? '(no message)'}`);
  }

  return { rows: body.data ?? [], total: body.total ?? 0 };
}

/** GET against the e-GP procurement app, which needs a browser-shaped UA. */
export async function egpGet(
  endpoint: string,
  params: Record<string, string | number>,
  headers: Record<string, string>,
): Promise<Response> {
  return fetchWithRetry(buildUrl(endpoint, params), { headers }, POLITENESS.torTimeoutMs);
}
