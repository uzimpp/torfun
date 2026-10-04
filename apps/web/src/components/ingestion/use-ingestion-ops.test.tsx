import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { IngestionOps } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { useIngestionOps } from './use-ingestion-ops';

vi.mock('@/lib/api-ingestion-ops', () => ({ fetchIngestionOps: vi.fn() }));
const { fetchIngestionOps } = await import('@/lib/api-ingestion-ops');
const mockedFetch = vi.mocked(fetchIngestionOps);

const ops = (runInProgress = false): IngestionOps => ({
  live: {
    runInProgress,
    runStartedAt: null,
    elapsedMs: null,
    stopRequested: false,
    inFlight: null,
    queueRemaining: null,
    memory: null,
  },
  recordTimings: { sample: 0, p50Ms: null, p90Ms: null, downloadP50Ms: null, analyseP50Ms: null },
  throughputDaily: [],
  failuresByStage: [],
  runs: [],
});

const POLL_MS = 5000;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => vi.useRealTimers());

describe('useIngestionOps', () => {
  test('reads once and stays quiet when no run is going', async () => {
    mockedFetch.mockResolvedValue(ops());
    const { result } = renderHook(() => useIngestionOps({ live: false }));
    await waitFor(() => expect(result.current.ops).not.toBeNull());

    await advance(POLL_MS * 3);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(result.current.updatedAt).toBeInstanceOf(Date);
  });

  test('polls while the page knows a run is live', async () => {
    mockedFetch.mockResolvedValue(ops());
    const { result } = renderHook(() => useIngestionOps({ live: true }));
    await waitFor(() => expect(result.current.ops).not.toBeNull());

    for (let tick = 0; tick < 2; tick += 1) await advance(POLL_MS);

    expect(mockedFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test('follows the run summary, not its own reading, on whether to poll', async () => {
    mockedFetch.mockResolvedValue(ops(true));
    const { result } = renderHook(() => useIngestionOps({ live: false }));
    await waitFor(() => expect(result.current.ops).not.toBeNull());

    await advance(POLL_MS * 2);

    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  test('reads once more when the run ends, so the finished run shows', async () => {
    mockedFetch.mockResolvedValue(ops());
    const { result, rerender } = renderHook(({ live }) => useIngestionOps({ live }), {
      initialProps: { live: true },
    });
    await waitFor(() => expect(result.current.ops).not.toBeNull());
    const before = mockedFetch.mock.calls.length;

    rerender({ live: false });

    await waitFor(() => expect(mockedFetch.mock.calls.length).toBe(before + 1));
    await advance(POLL_MS * 2);
    expect(mockedFetch.mock.calls.length).toBe(before + 1);
  });

  test('a failed poll stops the polling and says why; reload resumes', async () => {
    mockedFetch
      .mockResolvedValueOnce(ops(true))
      .mockRejectedValueOnce(new ApiError('boom', 500))
      .mockResolvedValue(ops(true));
    const { result } = renderHook(() => useIngestionOps({ live: true }));
    await waitFor(() => expect(result.current.ops).not.toBeNull());

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error?.kind).toBe('broken'));
    const calls = mockedFetch.mock.calls.length;
    await advance(POLL_MS * 2);
    expect(mockedFetch.mock.calls.length).toBe(calls);
    // The last good reading stays on screen beside the error.
    expect(result.current.ops).not.toBeNull();

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(mockedFetch.mock.calls.length).toBe(calls + 1);
  });

  test('an ended session is reported as such', async () => {
    mockedFetch.mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useIngestionOps({ live: false }));

    await waitFor(() => expect(result.current.error?.kind).toBe('sessionEnded'));
    expect(result.current.loading).toBe(false);
  });
});
