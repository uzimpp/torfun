import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError, SessionEndedError } from '@/lib/api';
import { EMPTY_PROCUREMENT_FILTERS, PROCUREMENT_PAGE_SIZE } from './procurement-filter-values';
import { LIST_POLL_MS, useProcurementList } from './use-procurement-list';

vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')),
  fetchProjects: vi.fn(),
}));

const api = await import('@/lib/api');
const fetchProjects = vi.mocked(api.fetchProjects);

const page = (total: number) => ({ items: [], total, limit: 25, offset: 0 });
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchProjects.mockResolvedValue(page(3));
});

afterEach(() => vi.useRealTimers());

describe('useProcurementList', () => {
  test('sends the filters and the 1-based page to the API', async () => {
    const filters = {
      ...EMPTY_PROCUREMENT_FILTERS,
      outcome: 'needs_review',
      status: 'open',
    } as const;
    const { result } = renderHook(() => useProcurementList(filters, 2));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'needs_review',
        status: 'open',
        offset: PROCUREMENT_PAGE_SIZE,
      }),
    );
    expect(result.current.total).toBe(3);
  });

  test('reads again when a filter changes', async () => {
    const { result, rerender } = renderHook(
      ({ q }) => useProcurementList({ ...EMPTY_PROCUREMENT_FILTERS, q }, 1),
      { initialProps: { q: '' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ q: 'ระบบ' });

    await waitFor(() =>
      expect(fetchProjects).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ระบบ' })),
    );
  });

  test('does not poll unless live', async () => {
    const { result } = renderHook(() => useProcurementList(EMPTY_PROCUREMENT_FILTERS, 1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await advance(LIST_POLL_MS * 3);

    expect(fetchProjects).toHaveBeenCalledOnce();
  });

  test('polls while live, and stops once a read fails', async () => {
    fetchProjects
      .mockResolvedValueOnce(page(1))
      .mockRejectedValue(new ApiError('Cannot reach the API', 0));
    const { result } = renderHook(() =>
      useProcurementList(EMPTY_PROCUREMENT_FILTERS, 1, { live: true }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await advance(LIST_POLL_MS);
    await waitFor(() => expect(result.current.error?.kind).toBe('unreachable'));
    const calls = fetchProjects.mock.calls.length;

    await advance(LIST_POLL_MS * 3);
    expect(fetchProjects.mock.calls.length).toBe(calls);
  });

  test('a read slower than the poll still lands, and the next waits for it', async () => {
    const slow = (total: number) =>
      new Promise<ReturnType<typeof page>>((resolve) =>
        setTimeout(() => resolve(page(total)), LIST_POLL_MS + 3000),
      );
    fetchProjects.mockResolvedValueOnce(page(1)).mockImplementationOnce(() => slow(2));
    const { result } = renderHook(() =>
      useProcurementList(EMPTY_PROCUREMENT_FILTERS, 1, { live: true }),
    );
    await waitFor(() => expect(result.current.total).toBe(1));

    await advance(LIST_POLL_MS);
    expect(fetchProjects).toHaveBeenCalledTimes(2);
    await advance(LIST_POLL_MS);
    expect(fetchProjects).toHaveBeenCalledTimes(2);
    await advance(3000);

    expect(result.current.total).toBe(2);
  });

  test('an ended session is reported as such, and reload reads again', async () => {
    fetchProjects.mockRejectedValueOnce(new SessionEndedError()).mockResolvedValue(page(0));
    const { result } = renderHook(() => useProcurementList(EMPTY_PROCUREMENT_FILTERS, 1));
    await waitFor(() => expect(result.current.error?.kind).toBe('sessionEnded'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(fetchProjects).toHaveBeenCalledTimes(2);
  });
});
