import { describe, expect, test } from 'bun:test';
import { mapWithConcurrency } from './concurrency';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  test('returns results in input order, whatever order the work finishes in', async () => {
    const finishesAfter = [30, 5, 15, 1];

    const results = await mapWithConcurrency(finishesAfter, 2, async (ms, index) => {
      await delay(ms);
      return `item-${index}`;
    });

    expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
  });

  test('never has more than the limit in flight, and does use the whole limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight -= 1;
    });

    expect(peak).toBe(2);
  });

  test('a limit of one is strictly sequential', async () => {
    const order: string[] = [];

    await mapWithConcurrency(['a', 'b', 'c'], 1, async (item) => {
      order.push(`start ${item}`);
      await delay(3);
      order.push(`end ${item}`);
    });

    expect(order).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  test('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 2, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([7], 5, async (n) => n * 2)).toEqual([14]);
  });

  test('a failure rejects the whole call rather than being lost', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
