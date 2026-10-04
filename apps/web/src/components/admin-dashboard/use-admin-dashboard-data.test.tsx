import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError, SessionEndedError, type IngestionSummaryResponse } from '@/lib/api';
import { useAdminDashboardData } from './use-admin-dashboard-data';

/**
 * The admin dashboard reads the queue summary and the most recent activity. It
 * refreshes while a run is in flight — and must not keep hammering the API
 * through a failure, or through a session that can no longer be renewed.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, fetchSummary: vi.fn(), fetchFailures: vi.fn() };
});
vi.mock('@/lib/api-ingestion-recent', () => ({ fetchRecent: vi.fn() }));

const api = await import('@/lib/api');
const recentApi = await import('@/lib/api-ingestion-recent');
const fetchSummary = vi.mocked(api.fetchSummary);
const fetchRecent = vi.mocked(recentApi.fetchRecent);
const fetchFailures = vi.mocked(api.fetchFailures);

function summary(runInProgress: boolean): IngestionSummaryResponse {
  return {
    total: 288,
    byState: { Queued: 243, Completed: 44, Processing: 1 },
    byOutcome: { queued: 243, tor_analysed: 38 },
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 38,
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
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchRecent.mockResolvedValue({ items: [] });
  fetchFailures.mockResolvedValue({ items: [] });
});

afterEach(() => vi.useRealTimers());

describe('useAdminDashboardData', () => {
  test('loads the summary and the recent activity together', async () => {
    fetchSummary.mockResolvedValue(summary(false));
    const { result } = renderHook(() => useAdminDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary?.total).toBe(288);
    expect(result.current.recent).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  test('reads the failure log too, for what needs attention', async () => {
    fetchSummary.mockResolvedValue(summary(false));
    const logged = {
      projectId: 'p1',
      projectName: null,
      stage: 'download' as const,
      error: 'HTTP 429 from x',
      at: '2026-09-30T10:00:00.000Z',
      kind: 'fault' as const,
    };
    fetchFailures.mockResolvedValue({ items: [logged] });
    const { result } = renderHook(() => useAdminDashboardData());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.failures).toEqual([logged]);
  });

  test('records when the data was fetched, so relative times are measured from then', async () => {
    fetchSummary.mockResolvedValue(summary(false));
    const { result } = renderHook(() => useAdminDashboardData());
    expect(result.current.asOf).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.asOf).toBeInstanceOf(Date);
  });

  test('does not poll while no run is in flight', async () => {
    fetchSummary.mockResolvedValue(summary(false));
    const { result } = renderHook(() => useAdminDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    for (let tick = 0; tick < 3; tick += 1) await advance(POLL_MS);

    expect(fetchSummary).toHaveBeenCalledTimes(1);
  });

  test('polls while a run is in flight', async () => {
    fetchSummary.mockResolvedValue(summary(true));
    const { result } = renderHook(() => useAdminDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    for (let tick = 0; tick < 3; tick += 1) await advance(POLL_MS);

    expect(fetchSummary.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  test('an ended session is reported as such and stops the polling', async () => {
    fetchSummary.mockResolvedValueOnce(summary(true));
    fetchSummary.mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useAdminDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error?.kind).toBe('sessionEnded'));
    const calls = fetchSummary.mock.calls.length;

    for (let tick = 0; tick < 3; tick += 1) await advance(POLL_MS);

    expect(fetchSummary.mock.calls.length).toBe(calls);
    expect(result.current.error).not.toBeNull();
  });

  test('another failure stops the polling too, and retry resumes it', async () => {
    fetchSummary.mockResolvedValueOnce(summary(true));
    fetchSummary.mockRejectedValueOnce(new ApiError('boom', 500));
    const { result } = renderHook(() => useAdminDashboardData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await advance(POLL_MS);
    await waitFor(() => expect(result.current.error).toEqual({ kind: 'broken', message: 'boom' }));
    const calls = fetchSummary.mock.calls.length;

    await advance(POLL_MS * 3);
    expect(fetchSummary.mock.calls.length).toBe(calls);

    fetchSummary.mockResolvedValue(summary(false));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
