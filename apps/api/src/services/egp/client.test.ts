import { afterEach, describe, expect, test } from 'bun:test';
import {
  egpGet,
  OpenDataForbiddenError,
  openDataGet,
  RateLimitedError,
  UpstreamError,
} from './client';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A fetch that never answers, and rejects the way a real one does when its signal aborts. */
function hangingFetch(calls: { count: number }) {
  return ((_url: unknown, init?: RequestInit) => {
    calls.count += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
    });
  }) as typeof fetch;
}

describe('egpGet with a caller-supplied signal', () => {
  test('aborting cancels the in-flight request, with no retry and no backoff', async () => {
    const calls = { count: 0 };
    globalThis.fetch = hangingFetch(calls);
    const controller = new AbortController();

    const started = Date.now();
    const pending = egpGet('https://example.test/x', {}, {}, controller.signal);
    setTimeout(() => controller.abort(), 10);

    await expect(pending).rejects.toThrow();
    expect(calls.count).toBe(1);
    // A retry would sleep the 5 s backoff first; giving up is immediate.
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  test('a signal that is already aborted never reaches the site', async () => {
    const calls = { count: 0 };
    globalThis.fetch = hangingFetch(calls);
    const controller = new AbortController();
    controller.abort();

    await expect(egpGet('https://example.test/x', {}, {}, controller.signal)).rejects.toThrow();
    expect(calls.count).toBe(0);
  });

  test('without a signal it behaves as before', async () => {
    globalThis.fetch = (async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const response = await egpGet('https://example.test/x', {}, {});
    expect(await response.text()).toBe('ok');
  });
});

describe('what an error says about the request that caused it', () => {
  const SECRET = 'SECRET-KEY-123';

  test('a rate-limit message never contains the API key from the URL', async () => {
    globalThis.fetch = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;

    const error = await openDataGet(
      'https://opend.test/egp-dept',
      { dept_name: 'x' },
      SECRET,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitedError);
    const message = (error as Error).message;
    expect(message).not.toContain(SECRET);
    expect(message).toContain('https://opend.test/egp-dept'); // still says where
    expect(message).toContain('429');
  });

  test('an upstream error message never contains the API key either', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

    const error = await openDataGet('https://opend.test/egp-dept', {}, SECRET).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as Error).message).not.toContain(SECRET);
  });
});

describe('the open-data API daily quota', () => {
  const answering = (headers: Record<string, string>) =>
    (async () =>
      new Response(JSON.stringify({ success: true, total: 0, data: [] }), {
        status: 200,
        headers,
      })) as unknown as typeof fetch;

  test('is read from the rate-limit headers of a response', async () => {
    globalThis.fetch = answering({
      'x-ratelimit-limit-day': '1000',
      'x-ratelimit-remaining-day': '640',
    });

    const page = await openDataGet('https://opend.test/x', {}, 'k');

    expect(page.quota).toEqual({ limitDay: 1000, remainingDay: 640 });
  });

  test('is unknown when the headers are absent, rather than zero', async () => {
    globalThis.fetch = answering({});

    const page = await openDataGet('https://opend.test/x', {}, 'k');

    expect(page.quota).toEqual({ limitDay: null, remainingDay: null });
  });

  test('a refusal carries the quota it was refused with', async () => {
    globalThis.fetch = (async () =>
      new Response('{"message":"API rate limit exceeded"}', {
        status: 429,
        headers: { 'x-ratelimit-limit-day': '1000', 'x-ratelimit-remaining-day': '0' },
      })) as unknown as typeof fetch;

    const error = await openDataGet('https://opend.test/x', {}, 'k').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).quota).toEqual({ limitDay: 1000, remainingDay: 0 });
  });
});

describe('a 403 is not the same refusal from the two upstreams', () => {
  const refusing = (status: number, headers: Record<string, string> = {}) =>
    (async () => new Response('', { status, headers })) as unknown as typeof fetch;

  test('from the open-data API it is a block or a refused key, not an exhausted allowance', async () => {
    globalThis.fetch = refusing(403, { 'x-ratelimit-remaining-day': '640' });

    const error = await openDataGet('https://opend.test/x', {}, 'k').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OpenDataForbiddenError);
    expect(error).not.toBeInstanceOf(RateLimitedError);
  });

  test('from the open-data API a 429 is still the day running out', async () => {
    globalThis.fetch = refusing(429);

    const error = await openDataGet('https://opend.test/x', {}, 'k').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitedError);
  });

  test('from the procurement site it is still a hard stop', async () => {
    globalThis.fetch = refusing(403);

    const error = await egpGet('https://site.test/x', {}, {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitedError);
  });

  test('the forbidden message never contains the API key', async () => {
    globalThis.fetch = refusing(403);

    const error = await openDataGet('https://opend.test/x', {}, 'SECRET-KEY-123').catch(
      (e: unknown) => e,
    );

    expect((error as Error).message).not.toContain('SECRET-KEY-123');
  });
});

describe('the open-data API is asked once, because every request is part of a small day', () => {
  test('a 5xx is not retried', async () => {
    const calls = { count: 0 };
    globalThis.fetch = (async () => {
      calls.count += 1;
      return new Response('', { status: 503 });
    }) as unknown as typeof fetch;

    const error = await openDataGet('https://opend.test/x', {}, 'k').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamError);
    expect(calls.count).toBe(1);
  });

  test('a transport failure is not retried', async () => {
    const calls = { count: 0 };
    globalThis.fetch = (async () => {
      calls.count += 1;
      throw new TypeError('network down');
    }) as unknown as typeof fetch;

    const error = await openDataGet('https://opend.test/x', {}, 'k').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamError);
    expect(calls.count).toBe(1);
  });

  test('the procurement site is still retried on a 5xx, with its backoff', async () => {
    const calls = { count: 0 };
    globalThis.fetch = (async () => {
      calls.count += 1;
      return calls.count === 1 ? new Response('', { status: 503 }) : new Response('ok');
    }) as unknown as typeof fetch;

    const response = await egpGet('https://site.test/x', {}, {});

    expect(await response.text()).toBe('ok');
    expect(calls.count).toBe(2);
  }, 15_000);
});
