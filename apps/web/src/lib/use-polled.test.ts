import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ApiError } from './api';
import { usePolled } from './use-polled';

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('usePolled', () => {
  test('an older answer arriving after a parameter change is dropped', async () => {
    const load = vi.fn((q: string) => (q === 'old' ? after(3000, 'old') : after(100, 'new')));
    const { result, rerender } = renderHook(
      ({ q }) => usePolled(() => load(q), { fallback: 'x', deps: [q] }),
      { initialProps: { q: 'old' } },
    );

    rerender({ q: 'new' });
    await advance(200);
    expect(result.current.data).toBe('new');
    await advance(3000);

    expect(result.current.data).toBe('new');
  });

  test('a parameter change clears the error that belonged to the old one', async () => {
    const load = vi.fn((q: string) =>
      q === 'bad' ? Promise.reject(new ApiError('boom', 500)) : after(1000, q),
    );
    const { result, rerender } = renderHook(
      ({ q }) => usePolled(() => load(q), { fallback: 'x', deps: [q] }),
      { initialProps: { q: 'bad' } },
    );
    await waitFor(() => expect(result.current.error?.kind).toBe('broken'));

    rerender({ q: 'good' });

    expect(result.current.error).toBeNull();
  });

  test('reads nothing while disabled', async () => {
    const load = vi.fn(() => Promise.resolve(1));
    const { result } = renderHook(() => usePolled(load, { fallback: 'x', enabled: false }));
    await advance(10_000);

    expect(load).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  test('the interval can follow the last read, so a poll ends when the data says so', async () => {
    const load = vi
      .fn<() => Promise<{ running: boolean }>>()
      .mockResolvedValueOnce({ running: true })
      .mockResolvedValue({ running: false });
    renderHook(() =>
      usePolled(load, { fallback: 'x', intervalMs: (data) => (data?.running ? 1000 : null) }),
    );
    await waitFor(() => expect(load).toHaveBeenCalledOnce());

    await advance(1000);
    await advance(5000);

    expect(load).toHaveBeenCalledTimes(2);
  });
});
