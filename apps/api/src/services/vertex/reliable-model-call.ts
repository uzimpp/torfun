/**
 * Timeout and retry policy around one model request.
 *
 * Kept apart from the Google client so the policy can be tested without a
 * network: `send` is whatever makes the request and honours the signal, and
 * `sleep` is injected so a test does not wait out a backoff.
 *
 * Why these rules, and only these:
 *  - A request that never answers freezes the serial ingestion run for good, so
 *    every call has a ceiling. Timing out is not retried: a call that hung once
 *    is likely to hang again, and the record's own deadline bounds the total.
 *  - 429 and 503 mean "busy, try again shortly", which is what backing off is
 *    for. Anything else — a bad request, a 500, a dropped socket — would be sent
 *    again unchanged and fail the same way, so it surfaces at once.
 */

export const MODEL_TIMEOUT_MS = 120_000;
/** Waits before retry 1 and retry 2; its length is the number of retries. */
export const MODEL_BACKOFF_MS = [2_000, 6_000] as const;

export class ModelTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini timed out after ${Math.round(timeoutMs / 1000)}s without answering.`);
    this.name = 'ModelTimeoutError';
  }
}

export interface ReliabilityOptions {
  timeoutMs?: number;
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

/** The SDK's `ApiError` carries the HTTP status; nothing else here needs to be known of it. */
function isBusy(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 429 || status === 503;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One attempt, raced against its own ceiling so a request that ignores its signal still ends. */
async function attempt(
  send: (signal: AbortSignal) => Promise<string>,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    return await Promise.race([send(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendReliably(
  send: (signal: AbortSignal) => Promise<string>,
  options: ReliabilityOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? MODEL_TIMEOUT_MS;
  const backoffMs = options.backoffMs ?? MODEL_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;

  for (let retry = 0; ; retry += 1) {
    try {
      return await attempt(send, timeoutMs);
    } catch (error) {
      const wait = backoffMs[retry];
      if (wait === undefined || !isBusy(error)) throw error;
      await sleep(wait);
    }
  }
}
