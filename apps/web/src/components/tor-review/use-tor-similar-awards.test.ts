import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { SimilarAwards } from '@torfun/types';

import { useTorSimilarAwards } from './use-tor-similar-awards';

vi.mock('@/lib/api', () => ({ fetchTorSimilarAwards: vi.fn() }));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const answer = (keyword: string): SimilarAwards =>
  ({ status: 'ok', keyword, listed: [], searches: [], complete: true }) as unknown as SimilarAwards;

beforeEach(() => vi.clearAllMocks());

describe('useTorSimilarAwards', () => {
  test('asks nothing on load', () => {
    const { result } = renderHook(() => useTorSimilarAwards('tor-1'));

    expect(result.current.state).toEqual({ status: 'idle' });
    expect(mocked.fetchTorSimilarAwards).not.toHaveBeenCalled();
  });

  test('calling search twice while one is running makes one request', async () => {
    let finish!: (value: SimilarAwards) => void;
    mocked.fetchTorSimilarAwards.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useTorSimilarAwards('tor-1'));

    act(() => {
      result.current.search();
      result.current.search();
    });

    expect(mocked.fetchTorSimilarAwards).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => finish(answer('k')));
    expect(result.current.state).toMatchObject({ status: 'ready' });
  });

  test('can be asked again once the first has finished', async () => {
    mocked.fetchTorSimilarAwards.mockResolvedValue(answer('k'));
    const { result } = renderHook(() => useTorSimilarAwards('tor-1'));

    await act(async () => result.current.search());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => result.current.search());

    expect(mocked.fetchTorSimilarAwards).toHaveBeenCalledTimes(2);
  });

  test('a failure is an error state, not an exception', async () => {
    mocked.fetchTorSimilarAwards.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useTorSimilarAwards('tor-1'));

    await act(async () => result.current.search());

    expect(result.current.state).toEqual({ status: 'error' });
  });

  test('another project starts idle, and the first one’s late answer is not shown on it', async () => {
    let finish!: (value: SimilarAwards) => void;
    mocked.fetchTorSimilarAwards.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result, rerender } = renderHook(({ id }) => useTorSimilarAwards(id), {
      initialProps: { id: 'tor-1' },
    });
    act(() => result.current.search());

    rerender({ id: 'tor-2' });
    expect(result.current.state).toEqual({ status: 'idle' });
    await act(async () => finish(answer('late')));

    expect(result.current.state).toEqual({ status: 'idle' });
  });
});
