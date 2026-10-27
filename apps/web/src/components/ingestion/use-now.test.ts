import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useNow } from './use-now';

/**
 * "In this stage for 3 minutes" has to keep counting while a console sits open,
 * so the page needs a clock that moves — held in state, because reading the
 * time while rendering would make the output depend on when it rendered.
 */
beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-30T12:00:00.000Z') }));
afterEach(() => vi.useRealTimers());

describe('useNow', () => {
  test('starts at the current time', () => {
    const { result } = renderHook(() => useNow(30_000));
    expect(result.current.toISOString()).toBe('2026-09-30T12:00:00.000Z');
  });

  test('moves forward on its interval', () => {
    const { result } = renderHook(() => useNow(30_000));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.toISOString()).toBe('2026-09-30T12:00:30.000Z');
  });

  test('stops ticking once the component is gone', () => {
    const { unmount } = renderHook(() => useNow(30_000));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
