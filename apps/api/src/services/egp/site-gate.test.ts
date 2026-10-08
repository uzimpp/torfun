import { describe, expect, test } from 'bun:test';
import { RateLimitedError } from './client';
import { createSiteGate, SiteLatchedError } from './site-gate';

/**
 * The gate is what keeps several runners within the terms of access to the
 * upstream site: one request at a time, a pause after each, and a stop that
 * every runner obeys at once. These pin those terms with a fake clock, so the
 * ordering is asserted rather than hoped for.
 */

function harness(pauseMs = 5_000) {
  let clock = 0;
  const log: string[] = [];
  const pauses: number[] = [];
  const gate = createSiteGate({
    pause: async () => {
      pauses.push(clock);
      clock += pauseMs;
    },
  });
  /** A site section that takes `ms` of fake time and records when it began and ended. */
  const section =
    (name: string, ms = 1_000) =>
    async () => {
      log.push(`${name} start@${clock}`);
      await Promise.resolve();
      clock += ms;
      log.push(`${name} end@${clock}`);
      return name;
    };
  /** What a runner does: wait for the gate, do one section, free it however it ends. */
  const use = async <T>(
    section: () => Promise<T>,
    options?: { pauseAfter?: boolean },
  ): Promise<T> => {
    const hold = await gate.acquire();
    try {
      return await section();
    } finally {
      await hold.release(options);
    }
  };
  return { gate, log, section, use, now: () => clock, pauses };
}

describe('the site gate', () => {
  test('lets one site section run at a time, whatever the number of runners', async () => {
    const { use, section, log } = harness();
    let inFlight = 0;
    let maxInFlight = 0;
    const tracked = (name: string) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const result = await section(name)();
      inFlight -= 1;
      return result;
    };

    await Promise.all(['a', 'b', 'c'].map((name) => use(tracked(name))));

    expect(maxInFlight).toBe(1);
    expect(log).toHaveLength(6);
  });

  test('waits the pause after one section ends before the next begins', async () => {
    const { use, section, log } = harness(5_000);

    await Promise.all([use(section('a')), use(section('b'))]);

    // a ends at 1000; the pause runs to 6000; only then does b start.
    expect(log).toEqual(['a start@0', 'a end@1000', 'b start@6000', 'b end@7000']);
  });

  test('serves callers in the order they arrived', async () => {
    const { use, section, log } = harness();

    await Promise.all(['a', 'b', 'c'].map((name) => use(section(name))));

    expect(log.filter((line) => line.includes('start')).map((line) => line[0])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('a section that throws still frees the gate, after the pause', async () => {
    const { use, section, log } = harness(5_000);

    const failing = use(async () => {
      throw new Error('site 500');
    });
    const next = use(section('b'));

    await expect(failing).rejects.toThrow('site 500');
    await next;
    expect(log[0]).toBe('b start@5000');
  });

  test('a rate-limit response stops every runner: the waiting ones never touch the site', async () => {
    const { gate, use, section, log } = harness();

    // The runner that meets the refusal latches the gate, as the pipeline does.
    const first = use(async () => {
      gate.latch();
      throw new RateLimitedError('https://site.test/x', 429);
    });
    const second = use(section('b'));
    const third = use(section('c'));

    const results = await Promise.allSettled([first, second, third]);

    expect(results.map((result) => (result as PromiseRejectedResult).reason?.constructor)).toEqual([
      RateLimitedError,
      SiteLatchedError,
      SiteLatchedError,
    ]);
    expect(log).toEqual([]);
    // And it stays stopped.
    await expect(use(section('d'))).rejects.toBeInstanceOf(SiteLatchedError);
  });

  test('a latched refusal is itself a rate-limit, so callers that stop on one stop on this', async () => {
    const { gate, use } = harness();
    gate.latch();

    const error = await use(async () => 'x').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitedError);
  });

  test('the last section can skip the pause, since nothing follows it', async () => {
    const { use, section, pauses } = harness();

    await use(section('a'), { pauseAfter: false });

    expect(pauses).toEqual([]);
  });
});
