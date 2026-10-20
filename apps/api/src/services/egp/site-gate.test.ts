import { describe, expect, test } from 'bun:test';
import { RateLimitedError } from './client';
import { createSiteGate, GATE_TIERS, type GateTier, SiteLatchedError } from './site-gate';

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
    now: () => clock,
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
    tier: GateTier = 'fresh',
  ): Promise<T> => {
    const hold = await gate.acquire(tier);
    try {
      return await section();
    } finally {
      await hold.release(options);
    }
  };
  /** Time passing with nobody at the gate. */
  const wait = (ms: number) => {
    clock += ms;
  };
  return { gate, log, section, use, now: () => clock, pauses, wait };
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

  test('its time is split into held, paused and idle, which add up to the time it has existed', async () => {
    const { gate, use, section, wait, now } = harness(5_000);

    wait(2_000);
    await Promise.all([use(section('a')), use(section('b'))]);
    wait(3_000);

    // a and b hold 1000 each, each pause is 5000, and nobody is there for 2000 + 3000.
    const stats = gate.stats();
    expect(stats).toEqual({ busyMs: 2_000, pausedMs: 10_000, idleMs: 5_000, holds: 2 });
    expect(stats.busyMs + stats.pausedMs + stats.idleMs).toBe(now());
  });

  test('a hold still open is counted up to the moment its stats are read', async () => {
    const { gate, wait } = harness();

    wait(1_000);
    const hold = await gate.acquire('fresh');
    wait(4_000);

    expect(gate.stats()).toEqual({ busyMs: 4_000, pausedMs: 0, idleMs: 1_000, holds: 1 });
    await hold.release();
  });

  test('a latch changes nothing about its stats but that the refused never count as holds', async () => {
    const { gate, use, section, wait, now } = harness(5_000);

    await use(section('a'));
    gate.latch();
    await expect(use(section('b'))).rejects.toBeInstanceOf(SiteLatchedError);
    wait(1_000);

    const stats = gate.stats();
    expect(stats).toEqual({ busyMs: 1_000, pausedMs: 5_000, idleMs: 1_000, holds: 1 });
    expect(stats.busyMs + stats.pausedMs + stats.idleMs).toBe(now());
  });

  describe('when it frees, the best tier waiting goes next', () => {
    /** The order sections started in, by name. */
    const starts = (log: string[]) =>
      log.filter((line) => line.includes('start')).map((line) => line.split(' ')[0]);

    test('a fresh waiter goes before a history waiter that arrived first', async () => {
      const { gate, use, section, log } = harness();
      const hold = await gate.acquire('history');

      const history = use(section('history'), undefined, 'history');
      const fresh = use(section('fresh'), undefined, 'fresh');
      await hold.release();
      await Promise.all([history, fresh]);

      expect(starts(log)).toEqual(['fresh', 'history']);
    });

    test('waiters of the same tier go in the order they arrived', async () => {
      const { gate, use, section, log } = harness();
      const hold = await gate.acquire('refresh');

      const waiters = ['a', 'b', 'c'].map((name) => use(section(name), undefined, 'refresh'));
      await hold.release();
      await Promise.all(waiters);

      expect(starts(log)).toEqual(['a', 'b', 'c']);
    });

    test('new days, then fresh, then refresh, then history', async () => {
      const { gate, use, section, log } = harness();
      const hold = await gate.acquire('history');

      // Queued worst first, so arrival order alone would get it backwards.
      const waiters = [...GATE_TIERS].reverse().map((tier) => use(section(tier), undefined, tier));
      await hold.release();
      await Promise.all(waiters);

      expect(starts(log)).toEqual(['new_day', 'fresh', 'refresh', 'history']);
    });

    test('a free gate is taken at once, whatever the tier', async () => {
      const { use, section, log } = harness();

      await use(section('history'), undefined, 'history');

      expect(log).toEqual(['history start@0', 'history end@1000']);
    });

    test('a latch refuses waiters of every tier, and leaves none pending', async () => {
      const { gate, use, section, log } = harness();
      const hold = await gate.acquire('new_day');

      const waiters = GATE_TIERS.map((tier) => use(section(tier), undefined, tier));
      gate.latch();
      await hold.release();
      const results = await Promise.allSettled(waiters);

      expect(
        results.map((result) => (result as PromiseRejectedResult).reason?.constructor),
      ).toEqual(GATE_TIERS.map(() => SiteLatchedError));
      expect(gate.pending).toBe(0);
      expect(log).toEqual([]);
      for (const tier of GATE_TIERS) {
        await expect(gate.acquire(tier)).rejects.toBeInstanceOf(SiteLatchedError);
      }
    });

    test('its stats still add up when tiers reorder the turns', async () => {
      const { gate, use, section, now } = harness(5_000);
      const hold = await gate.acquire('history');

      const waiters = [
        use(section('h'), undefined, 'history'),
        use(section('n'), undefined, 'new_day'),
      ];
      await hold.release();
      await Promise.all(waiters);

      const stats = gate.stats();
      expect(stats.holds).toBe(3);
      expect(stats.busyMs + stats.pausedMs + stats.idleMs).toBe(now());
    });
  });
});
