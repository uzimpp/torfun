import { describe, expect, mock, test } from 'bun:test';
import { ModelTimeoutError, sendReliably } from './reliable-model-call';

/** An error shaped like the SDK's `ApiError`, which carries the HTTP status. */
function apiError(status: number): Error & { status: number } {
  return Object.assign(new Error(`got ${status}`), { status });
}

const noSleep = async () => {};

describe('sendReliably', () => {
  test('returns the answer of a call that succeeds first time', async () => {
    const send = mock(async () => '{"isTor":true}');

    expect(await sendReliably(send, { sleep: noSleep })).toBe('{"isTor":true}');
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('retries a 429 after backing off, and returns the answer that follows', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    let calls = 0;
    const send = async () => {
      calls += 1;
      if (calls === 1) throw apiError(429);
      return 'ok';
    };

    expect(await sendReliably(send, { sleep, backoffMs: [10, 20] })).toBe('ok');
    expect(calls).toBe(2);
    expect(waits).toEqual([10]);
  });

  test('gives up after two retries of a 503 and throws the last error', async () => {
    const send = mock(async () => {
      throw apiError(503);
    });
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };

    await expect(sendReliably(send, { sleep, backoffMs: [10, 20] })).rejects.toThrow('got 503');

    expect(send).toHaveBeenCalledTimes(3); // the first try and two retries
    expect(waits).toEqual([10, 20]);
  });

  test('does not retry any other failure', async () => {
    for (const failure of [apiError(400), apiError(500), new Error('socket hang up')]) {
      const send = mock(async () => {
        throw failure;
      });

      await expect(sendReliably(send, { sleep: noSleep })).rejects.toBe(failure);
      expect(send).toHaveBeenCalledTimes(1);
    }
  });

  test('a call that never answers times out, is aborted, and is not retried', async () => {
    let seen: AbortSignal | undefined;
    const send = mock(async (signal: AbortSignal) => {
      seen = signal;
      return new Promise<string>(() => {}); // a hung request that ignores its signal
    });

    const started = Date.now();
    await expect(sendReliably(send, { sleep: noSleep, timeoutMs: 30 })).rejects.toBeInstanceOf(
      ModelTimeoutError,
    );

    expect(Date.now() - started).toBeLessThan(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(seen?.aborted).toBe(true);
  });

  test('the timeout error says so, so it is not mistaken for a bad answer', () => {
    expect(new ModelTimeoutError(120_000).message).toMatch(/timed out after 120s/i);
  });
});
