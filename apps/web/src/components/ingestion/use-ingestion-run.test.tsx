import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError, SessionEndedError, type IngestionSummaryResponse } from '@/lib/api';
import { useIngestionRun } from './use-ingestion-run';

/**
 * The console polls every five seconds while a run is in flight. What matters
 * here is what it does when a poll fails: a session that has ended must stop the
 * polling and say so, and any other failure must not keep hammering the API
 * (and stacking the same error) every five seconds until someone notices.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    fetchSummary: vi.fn(),
    fetchFailures: vi.fn(),
    startIngestionRun: vi.fn(),
    stopIngestionRun: vi.fn(),
  };
});

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

function summary(runInProgress: boolean): IngestionSummaryResponse {
  return {
    total: 0,
    byState: {},
    byOutcome: {},
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 0,
    totalTorBytes: 0,
    failureCount: 0,
    lastRunAt: null,
    openDataQuota: null,
    runInProgress,
    runStartedAt: null,
    stopRequested: false,
    agencies: [],
  };
}

const POLL_MS = 5000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocked.fetchFailures.mockResolvedValue({ items: [] });
});

afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('polling a run in flight', () => {
  test('keeps polling while the run is going and nothing fails', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(true));
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.running).toBe(true));

    // One tick per act(): inside a single act React batches the three
    // refreshKey bumps into one render, which would understate the polling.
    for (let tick = 0; tick < 3; tick += 1) await advance(POLL_MS);

    expect(mocked.fetchSummary.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(result.current.error).toBeNull();
  });

  test('a session that ended mid-run stops the polling and is reported as ended', async () => {
    mocked.fetchSummary
      .mockResolvedValueOnce(summary(true))
      .mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.running).toBe(true));

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error?.kind).toBe('sessionEnded'));
    const callsAtEnd = mocked.fetchSummary.mock.calls.length;

    await advance(POLL_MS * 4);

    expect(mocked.fetchSummary.mock.calls.length).toBe(callsAtEnd);
    expect(result.current.error).toBeTruthy();
  });

  test('any other failure also stops the polling instead of repeating the error', async () => {
    mocked.fetchSummary
      .mockResolvedValueOnce(summary(true))
      .mockRejectedValue(new ApiError('Cannot reach the API', 0));
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.running).toBe(true));

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error?.kind).toBe('unreachable'));
    const callsAtFailure = mocked.fetchSummary.mock.calls.length;

    await advance(POLL_MS * 4);

    expect(mocked.fetchSummary.mock.calls.length).toBe(callsAtFailure);
  });

  test('retry reloads, clears the error, and polling resumes', async () => {
    mocked.fetchSummary
      .mockResolvedValueOnce(summary(true))
      .mockRejectedValueOnce(new ApiError('Cannot reach the API', 0))
      .mockResolvedValue(summary(true));
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.running).toBe(true));
    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBeNull());
    const callsAfterRetry = mocked.fetchSummary.mock.calls.length;
    await advance(POLL_MS * 2);

    expect(mocked.fetchSummary.mock.calls.length).toBeGreaterThan(callsAfterRetry);
  });
});

describe('starting a run', () => {
  test('a session that ended is reported as ended, not as a failed start', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(false));
    mocked.startIngestionRun.mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.startRun());

    expect(result.current.actionError).toMatchObject({
      action: 'start',
      error: { kind: 'sessionEnded' },
    });
  });

  test('a second press while the first is unanswered sends nothing', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(false));
    let answer: () => void = () => {};
    mocked.startIngestionRun.mockImplementation(
      () => new Promise((resolve) => (answer = () => resolve({ started: true, message: '' }))),
    );
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first!: Promise<void>;
    act(() => {
      first = result.current.startRun();
      void result.current.startRun();
    });
    expect(result.current.starting).toBe(true);
    await act(async () => {
      answer();
      await first;
    });

    expect(mocked.startIngestionRun).toHaveBeenCalledOnce();
    expect(result.current.starting).toBe(false);
  });
});

describe('stopping a run', () => {
  test('asks the API, then reads the summary again so the banner shows it is stopping', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(true));
    mocked.stopIngestionRun.mockResolvedValue({ stopping: true });
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mocked.fetchSummary.mock.calls.length;

    await act(() => result.current.stopRun());

    expect(mocked.stopIngestionRun).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocked.fetchSummary.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(result.current.actionError).toBeNull();
  });

  test('a session that ended is reported as ended, not as a failed stop', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(true));
    mocked.stopIngestionRun.mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.stopRun());

    expect(result.current.actionError).toMatchObject({
      action: 'stop',
      error: { kind: 'sessionEnded' },
    });
  });

  test('if the run had already finished, it is no error: the page just reads the summary again', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(true));
    mocked.stopIngestionRun.mockRejectedValue(
      new ApiError('No ingestion run is in progress.', 409),
    );
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mocked.fetchSummary.mock.calls.length;

    await act(() => result.current.stopRun());

    await waitFor(() => expect(mocked.fetchSummary.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(result.current.actionError).toBeNull();
  });

  test('any other failure is shown in Thai', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(true));
    mocked.stopIngestionRun.mockRejectedValue(new TypeError('network down'));
    const { result } = renderHook(() => useIngestionRun());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.stopRun());

    expect(result.current.actionError).toEqual({
      action: 'stop',
      error: { kind: 'broken', message: 'ไม่สามารถหยุดรอบการดึงข้อมูลได้' },
    });
  });
});
