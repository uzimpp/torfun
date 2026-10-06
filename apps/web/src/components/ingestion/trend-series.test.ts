import { describe, expect, test } from 'vitest';
import type { DailyDiscovered } from '@torfun/types';

import { discoveredSeries, markIndexes, throughputSeries } from './trend-series';

/** 30 Bangkok days ending 5 Oct 2026, zero-filled as the API sends them. */
const days = (at: (date: string, index: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8, 6 + index)).toISOString().slice(0, 10);
    return { date, ...at(date, index) };
  });

describe('markIndexes', () => {
  test('marks the highest and the latest value', () => {
    expect([...markIndexes([1, 5, 2, 3])].sort()).toEqual([1, 3]);
  });

  test('marks one point when the latest is the highest', () => {
    expect([...markIndexes([1, 2, 7])]).toEqual([2]);
  });

  test('marks nothing on a series of zeros', () => {
    expect(markIndexes([0, 0, 0]).size).toBe(0);
  });

  test('leaves a zero latest unmarked', () => {
    expect([...markIndexes([0, 4, 0])]).toEqual([1]);
  });
});

describe('discoveredSeries', () => {
  test('keeps every day, labels it in short Thai, and marks the peak and the latest', () => {
    const series = discoveredSeries(
      days((_, index) => ({
        discovered: index === 10 ? 25 : index === 29 ? 3 : 0,
      })) as DailyDiscovered[],
    );

    expect(series.points).toHaveLength(30);
    expect(series.points.at(-1)).toMatchObject({ date: '2026-10-05', label: '5 ต.ค.', mark: '3' });
    expect(series.points[10]!.mark).toBe('25');
    expect(series.points[0]!.mark).toBeNull();
    expect(series.total).toBe(28);
    expect(series.empty).toBe(false);
  });

  test('is empty on a quiet month, though every day is still there', () => {
    const series = discoveredSeries(days(() => ({ discovered: 0 })) as DailyDiscovered[]);
    expect(series.points).toHaveLength(30);
    expect(series.empty).toBe(true);
  });
});

describe('throughputSeries', () => {
  test('stacks the three outcomes and marks the day totals', () => {
    const series = throughputSeries(
      days((_, index) =>
        index === 29 ? { completed: 5, held: 2, failed: 1 } : { completed: 0, held: 0, failed: 0 },
      ) as never,
    );

    expect(series.points.at(-1)).toMatchObject({
      completed: 5,
      held: 2,
      failed: 1,
      total: 8,
      mark: '8',
    });
    expect(series.totals).toEqual({ completed: 5, held: 2, failed: 1 });
    expect(series.empty).toBe(false);
  });
});
