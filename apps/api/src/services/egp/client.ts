import { POLITENESS } from './constants';

/**
 * HTTP helpers for the two upstream systems.
 *
 * Both are third-party government services we don't control, so every call
 * here treats a malformed or unexpected response as a first-class outcome
 * rather than trusting the shape.
 */

/**
 * A URL as it may be shown to a person or stored in the failure log.
 *
 * The open-data API takes its key as a query parameter, so the raw URL is a
 * credential. An error message is copied into Mongo and onto the admin page, so
 * every message that names a URL goes through this first.
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&](?:api[-_]?key|apikey|token|key|secret)=)[^&\s]*/gi, '$1[redacted]');
}

/** `redactUrl`, plus the key itself wherever it appears, in a URL or not. */
export function redactSecret(text: string, secret: string): string {
  const withoutUrlKeys = redactUrl(text);
  return secret ? withoutUrlKeys.split(secret).join('[redacted]') : withoutUrlKeys;
}

/** The day's allowance as an open-data response reports it; null where it did not say. */
export interface QuotaReading {
  limitDay: number | null;
  remainingDay: number | null;
}

export interface OpenDataRetryOptions {
  maxRetries?: number;
  retryBackoffMs?: readonly number[];
  quotaBudget?: OpenDataQuotaBudget;
}

function quotaFrom(headers: Headers): QuotaReading {
  const read = (name: string): number | null => {
    const value = Number(headers.get(name));
    return headers.get(name) !== null && Number.isFinite(value) ? value : null;
  };
  return {
    limitDay: read('x-ratelimit-limit-day'),
    remainingDay: read('x-ratelimit-remaining-day'),
  };
}

export class RateLimitedError extends Error {
  /** What the refusal said about the allowance, where it said anything. */
  readonly quota: QuotaReading | null;

  constructor(url: string, status: number, quota: QuotaReading | null = null) {
    super(`HTTP ${status} from ${redactUrl(url)} — treating as rate limited`);
    this.quota = quota;
    this.name = 'RateLimitedError';
  }
}

/**
 * The open-data API answered 403. That is a block in front of it (Cloudflare) or
 * a key it refused, and says nothing about the day's allowance — unlike a 429,
 * which is the allowance running out. Kept apart so a block is not recorded as
 * an empty quota. It still ends a sweep: repeating a refused request is not a
 * fix, and the failure log carries the difference.
 */
export class OpenDataForbiddenError extends Error {
  constructor(url: string) {
    super(`HTTP 403 from ${redactUrl(url)} — blocked or key refused, not a spent allowance`);
    this.name = 'OpenDataForbiddenError';
  }
}

export class OpenDataQuotaExhaustedError extends Error {
  constructor() {
    super('GovSpending daily request quota is exhausted');
    this.name = 'OpenDataQuotaExhaustedError';
  }
}

export const OPEN_DATA_DAILY_REQUEST_LIMIT = 1000;

export class OpenDataQuotaBudget {
  private remaining: number;

  constructor(initialRemaining = OPEN_DATA_DAILY_REQUEST_LIMIT) {
    if (!Number.isSafeInteger(initialRemaining) || initialRemaining < 0) {
      throw new RangeError('Open-data quota must be a non-negative integer');
    }
    this.remaining = initialRemaining;
  }

  get remainingDay(): number {
    return this.remaining;
  }

  reserveAttempt(): void {
    if (this.remaining === 0) throw new OpenDataQuotaExhaustedError();
    this.remaining -= 1;
  }

  observe(quota: QuotaReading): void {
    if (quota.remainingDay !== null) this.remaining = Math.min(this.remaining, quota.remainingDay);
  }
}

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** No answer at all came back (a timeout or a dropped connection), not even an error page. */
export class UnreachableError extends UpstreamError {
  constructor(message: string) {
    super(message);
    this.name = 'UnreachableError';
  }
}

/**
 * The site answered with a web page where it sends data: the notice it puts in
 * front of every endpoint while it is closed. Every request after would get the
 * same page, so a Run stops at the first.
 */
export class SiteUnavailableError extends UpstreamError {
  constructor(title: string) {
    super(`e-GP sent a web page instead of data, so the site is likely closed: "${title}"`);
    this.name = 'SiteUnavailableError';
  }
}

function pageTitle(html: string): string {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  if (!title) return '(untitled)';
  return title.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) =>
    String.fromCodePoint(code[0] === 'x' ? parseInt(code.slice(1), 16) : Number(code)),
  );
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
 * point is to back off the site rather than hammer it (the open-data API's 403
 * is told apart, via `onForbidden`). 5xx is retried, since that's the upstream
 * having a bad moment rather than refusing us — except where `maxRetries` says
 * each request is too dear to repeat.
 *
 * `signal` lets the caller call the whole thing off — the pipeline does at a
 * record's deadline, so an abandoned request cannot linger and overlap the next
 * record's. An aborted request is final: it is neither retried nor backed off.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  options: {
    signal?: AbortSignal;
    /** Where a 403 is not the site saying stop, the error to raise for it instead. */
    onForbidden?: (url: string) => Error;
    /** Retries after the first attempt; the site default applies where unset. */
    maxRetries?: number;
    retryBackoffMs?: readonly number[];
    stopOnQuotaExhaustion?: boolean;
    quotaBudget?: OpenDataQuotaBudget;
  } = {},
): Promise<Response> {
  const { signal, onForbidden, retryBackoffMs, stopOnQuotaExhaustion, quotaBudget } = options;
  const maxRetries = options.maxRetries ?? POLITENESS.maxRetries;
  let lastError = 'unknown failure';
  let answered = false;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) throw new UpstreamError(`Request cancelled: ${redactUrl(url)}`);
    quotaBudget?.reserveAttempt();

    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, {
        ...init,
        signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
      });

      const quota = quotaFrom(response.headers);
      quotaBudget?.observe(quota);
      if (response.status === 403 && onForbidden) throw onForbidden(url);
      if (response.status === 429 || response.status === 403) {
        throw new RateLimitedError(url, response.status, quota);
      }
      if (response.status >= 500) {
        if (stopOnQuotaExhaustion && quota.remainingDay === 0) {
          throw new OpenDataQuotaExhaustedError();
        }
        answered = true;
        lastError = `HTTP ${response.status}`;
      } else if (!response.ok) {
        throw new UpstreamError(`HTTP ${response.status} from ${redactUrl(url)}`);
      } else {
        return response;
      }
    } catch (error) {
      if (
        error instanceof RateLimitedError ||
        error instanceof OpenDataForbiddenError ||
        error instanceof OpenDataQuotaExhaustedError ||
        error instanceof UpstreamError
      ) {
        throw error;
      }
      if (signal?.aborted) throw new UpstreamError(`Request cancelled: ${redactUrl(url)}`);
      answered = false;
      lastError = `transport error: ${redactUrl(error instanceof Error ? error.message : String(error))}`;
    }

    if (attempt < maxRetries) {
      await sleep(retryBackoffMs?.[attempt] ?? POLITENESS.retryBackoffMs[attempt] ?? 5000);
    }
  }

  throw answered ? new UpstreamError(lastError) : new UnreachableError(lastError);
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
  retry: OpenDataRetryOptions = {},
): Promise<{ rows: T[]; total: number | null; quota: QuotaReading }> {
  try {
    return await requestOpenData<T>(endpoint, params, apiKey, retry);
  } catch (error) {
    // Every message here is copied into Mongo, the logs and the admin page. Some of
    // it is not ours (the API's own `message`, a transport error's text), so the key
    // is removed from whatever any failure says, whichever way it got in. The error
    // is changed in place so its class, which callers branch on, is kept.
    if (error instanceof Error) {
      error.message = redactSecret(error.message, apiKey);
      if (error.stack) error.stack = redactSecret(error.stack, apiKey);
    }
    throw error;
  }
}

async function requestOpenData<T>(
  endpoint: string,
  params: Record<string, string | number>,
  apiKey: string,
  retry: OpenDataRetryOptions,
): Promise<{ rows: T[]; total: number | null; quota: QuotaReading }> {
  const url = buildUrl(endpoint, { ...params, 'api-key': apiKey });
  const response = await fetchWithRetry(url, {}, POLITENESS.openDataTimeoutMs, {
    onForbidden: (forbiddenUrl) => new OpenDataForbiddenError(forbiddenUrl),
    // The default stays one request because a failed open-data request may count
    // against the daily allowance. Callers with an explicit retry policy opt in.
    maxRetries: retry.maxRetries ?? 0,
    retryBackoffMs: retry.retryBackoffMs,
    stopOnQuotaExhaustion: true,
    quotaBudget: retry.quotaBudget ?? new OpenDataQuotaBudget(),
  });

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

  if (body.data !== undefined && !Array.isArray(body.data)) {
    throw new UpstreamError(`Invalid data array from ${endpoint}`);
  }

  const total =
    typeof body.total === 'number' && Number.isSafeInteger(body.total) && body.total >= 0
      ? body.total
      : null;
  return { rows: body.data ?? [], total, quota: quotaFrom(response.headers) };
}

/** GET against the e-GP procurement app, which needs a browser-shaped UA. */
export async function egpGet(
  endpoint: string,
  params: Record<string, string | number>,
  headers: Record<string, string>,
  signal?: AbortSignal,
  /** `lookup`: a small answer, so a short wait and no retries (see `POLITENESS`). */
  kind: 'download' | 'lookup' = 'download',
): Promise<Response> {
  const lookup = kind === 'lookup';
  const response = await fetchWithRetry(
    buildUrl(endpoint, params),
    { headers },
    lookup ? POLITENESS.lookupTimeoutMs : POLITENESS.torTimeoutMs,
    { signal, maxRetries: lookup ? 0 : undefined },
  );
  if (lookup) {
    const head = (await response.clone().text()).trimStart().slice(0, 4096);
    if (/^<(!doctype html|html)[\s>]/i.test(head)) throw new SiteUnavailableError(pageTitle(head));
  }
  return response;
}
