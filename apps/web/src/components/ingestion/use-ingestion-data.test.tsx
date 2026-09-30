import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError, SessionEndedError, type IngestionSummaryResponse } from '@/lib/api';
import { EMPTY_FILTERS, useIngestionData } from './use-ingestion-data';

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
    fetchProjects: vi.fn(),
    fetchFailures: vi.fn(),
    startIngestionRun: vi.fn(),
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
    agencies: [],
  };
}

const empty = { items: [], total: 0, limit: 25, offset: 0 };

const POLL_MS = 5000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocked.fetchProjects.mockResolvedValue(empty);
  mocked.fetchFailures.mockResolvedValue({ items: [] });
});

afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe('polling a run in flight', () => {
  test('keeps polling while the run is going and nothing fails', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(true));
    const { result } = renderHook(() => useIngestionData(EMPTY_FILTERS, 0));
    await waitFor(() => expect(result.current.running).toBe(true));

    // One tick per act(): inside a single act React batches the three
    // refreshKey bumps into one render, which would understate the polling.
    for (let tick = 0; tick < 3; tick += 1) await advance(POLL_MS);

    expect(mocked.fetchSummary.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(result.current.error).toBeNull();
    expect(result.current.sessionEnded).toBe(false);
  });

  test('a session that ended mid-run stops the polling and is reported as ended', async () => {
    mocked.fetchSummary
      .mockResolvedValueOnce(summary(true))
      .mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useIngestionData(EMPTY_FILTERS, 0));
    await waitFor(() => expect(result.current.running).toBe(true));

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.sessionEnded).toBe(true));
    const callsAtEnd = mocked.fetchSummary.mock.calls.length;

    await advance(POLL_MS * 4);

    expect(mocked.fetchSummary.mock.calls.length).toBe(callsAtEnd);
    expect(result.current.error).toBeTruthy();
  });

  test('any other failure also stops the polling instead of repeating the error', async () => {
    mocked.fetchSummary
      .mockResolvedValueOnce(summary(true))
      .mockRejectedValue(new ApiError('Cannot reach the API', 0));
    const { result } = renderHook(() => useIngestionData(EMPTY_FILTERS, 0));
    await waitFor(() => expect(result.current.running).toBe(true));

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error).toBe('Cannot reach the API'));
    const callsAtFailure = mocked.fetchSummary.mock.calls.length;

    await advance(POLL_MS * 4);

    expect(mocked.fetchSummary.mock.calls.length).toBe(callsAtFailure);
    expect(result.current.sessionEnded).toBe(false);
  });

  test('retry reloads, clears the error, and polling resumes', async () => {
    mocked.fetchSummary
      .mockResolvedValueOnce(summary(true))
      .mockRejectedValueOnce(new ApiError('Cannot reach the API', 0))
      .mockResolvedValue(summary(true));
    const { result } = renderHook(() => useIngestionData(EMPTY_FILTERS, 0));
    await waitFor(() => expect(result.current.running).toBe(true));
    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error).toBeTruthy());

    act(() => result.current.retry());
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
    const { result } = renderHook(() => useIngestionData(EMPTY_FILTERS, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.startRun());

    expect(result.current.sessionEnded).toBe(true);
  });
});

describe('filters', () => {
  test('sends the outcome and procurement-status filters to the queue query', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(false));
    const filters = { ...EMPTY_FILTERS, outcome: 'analysing', status: 'drafting' };
    const { result } = renderHook(() => useIngestionData(filters, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mocked.fetchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'analysing', status: 'drafting' }),
    );
  });

  test('leaves them out of the query when they are not set', async () => {
    mocked.fetchSummary.mockResolvedValue(summary(false));
    const { result } = renderHook(() => useIngestionData(EMPTY_FILTERS, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const query = mocked.fetchProjects.mock.calls[0]?.[0] ?? {};
    expect(query).not.toHaveProperty('outcome');
    expect(query).not.toHaveProperty('status');
  });
});
