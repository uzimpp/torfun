import { describe, expect, test } from 'bun:test';
import { createLimiter } from './concurrency';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('createLimiter', () => {
  test('never has more than its size in flight, and does use all of it', async () => {
    const limiter = createLimiter(3);
    let inFlight = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        limiter.run(async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await delay(3);
          inFlight -= 1;
        }),
      ),
    );

    expect(peak).toBe(3);
  });

  test('waiters go in the order they asked', async () => {
    const limiter = createLimiter(1);
    const order: string[] = [];

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((item) =>
        limiter.run(async () => {
          order.push(item);
          await delay(1);
        }),
      ),
    );

    expect(order).toEqual(['a', 'b', 'c', 'd']);
  });

  test('a rejected call frees its place for the next', async () => {
    const limiter = createLimiter(1);

    const failed = limiter.run(async () => {
      throw new Error('boom');
    });
    const next = limiter.run(async () => 'ran');

    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('ran');
  });

  test('a place taken by hand is held until given back, and giving it back twice frees one', async () => {
    const limiter = createLimiter(1);
    const release = await limiter.acquire();
    let ran = false;
    const waiting = limiter.run(async () => {
      ran = true;
    });

    await delay(2);
    expect(ran).toBe(false);
    release();
    release();
    await waiting;
    expect(ran).toBe(true);
    // The double release did not leave a spare place behind.
    const second = await limiter.acquire();
    let third = false;
    void limiter.acquire().then(() => {
      third = true;
    });
    await delay(2);
    expect(third).toBe(false);
    second();
  });

  test('a place can be tried for without waiting: none while it is full, one once given back', async () => {
    const limiter = createLimiter(1);
    const first = limiter.tryAcquire();
    expect(first).not.toBeNull();
    expect(limiter.tryAcquire()).toBeNull();

    first!();
    const again = limiter.tryAcquire();
    expect(again).not.toBeNull();
    again!();
  });

  test('trying does not jump ahead of someone already waiting', async () => {
    const limiter = createLimiter(1);
    const held = await limiter.acquire();
    const waiting = limiter.acquire();
    held();

    expect(limiter.tryAcquire()).toBeNull();
    (await waiting)();
  });
});
