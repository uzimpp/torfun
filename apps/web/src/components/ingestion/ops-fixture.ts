import type { IngestionOps } from '@torfun/types';

/**
 * Test data shaped like `GET /api/ingestion/ops`: every daily series has one
 * entry per Bangkok day of the 30-day window, quiet days as zeros.
 */

/** The window's days, oldest first, ending on `end`. */
export function windowDays(end = '2026-10-05', length = 30): string[] {
  const last = Date.parse(`${end}T00:00:00.000Z`);
  return Array.from({ length }, (_, index) =>
    new Date(last - (length - 1 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** A quiet window, with `on` setting the values of particular days. */
export function dailyWindow<T extends object>(
  zero: T,
  on: Record<string, Partial<T>> = {},
): (T & { date: string })[] {
  return windowDays().map((date) => ({ date, ...zero, ...on[date] }));
}

export const ZERO_THROUGHPUT = { completed: 0, held: 0, failed: 0 };
export const ZERO_DISCOVERED = { discovered: 0 };
export function opsFixture(overrides: Partial<IngestionOps> = {}): IngestionOps {
  return {
    live: {
      runInProgress: false,
      runStartedAt: null,
      elapsedMs: null,
      stopRequested: false,
      inFlight: null,
      queueRemaining: null,
    },
    recordTimings: { sample: 0, p50Ms: null, p90Ms: null, downloadP50Ms: null, analyseP50Ms: null },
    throughputDaily: dailyWindow(ZERO_THROUGHPUT),
    discoveredDaily: dailyWindow(ZERO_DISCOVERED),
    failuresByStage: [],
    runs: [],
    ...overrides,
  };
}
