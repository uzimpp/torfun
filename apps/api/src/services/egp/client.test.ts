import { afterEach, describe, expect, test } from 'bun:test';
import { egpGet } from './client';

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
