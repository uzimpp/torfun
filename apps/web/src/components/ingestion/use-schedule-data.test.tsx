import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SCHEDULE, type ScheduleView } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { useScheduleData } from './use-schedule-data';

vi.mock('@/lib/api-schedule', () => ({
  fetchSchedule: vi.fn(),
  updateSchedule: vi.fn(),
}));

const api = await import('@/lib/api-schedule');
const mocked = vi.mocked(api);

const off: ScheduleView = {
  ...DEFAULT_SCHEDULE,
  lastRunAt: null,
  nextRunAt: null,
  upcomingRunAts: [],
};
const values = {
  enabled: true,
  mode: 'weekly' as const,
  timeOfDay: '02:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  everyHours: 24,
};
const on: ScheduleView = {
  ...off,
  ...values,
  updatedAt: '2026-10-01T05:00:00.000Z',
  updatedBy: 'admin-1',
  nextRunAt: '2026-10-01T19:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('loading the schedule', () => {
  test('reads it once on mount', async () => {
    mocked.fetchSchedule.mockResolvedValue(off);
    const { result } = renderHook(() => useScheduleData());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.schedule).toEqual(off);
    expect(result.current.error).toBeNull();
    expect(mocked.fetchSchedule).toHaveBeenCalledTimes(1);
  });

  test('a failure is reported with the server message, and retry reads it again', async () => {
    mocked.fetchSchedule.mockRejectedValueOnce(new ApiError('Cannot reach the API', 0));
    const { result } = renderHook(() => useScheduleData());
    await waitFor(() => expect(result.current.error).toBe('Cannot reach the API'));
    expect(result.current.sessionEnded).toBe(false);

    mocked.fetchSchedule.mockResolvedValueOnce(off);
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.schedule).toEqual(off));
    expect(result.current.error).toBeNull();
  });

  test('an ended session is reported as such, so the page can say to sign in again', async () => {
    mocked.fetchSchedule.mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useScheduleData());

    await waitFor(() => expect(result.current.sessionEnded).toBe(true));
    expect(result.current.error).not.toBeNull();
  });
});

describe('saving', () => {
  test('sends the form values, then shows what the server says and that it saved', async () => {
    mocked.fetchSchedule.mockResolvedValue(off);
    mocked.updateSchedule.mockResolvedValue(on);
    const { result } = renderHook(() => useScheduleData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.save(values));

    expect(mocked.updateSchedule).toHaveBeenCalledWith(values);
    expect(result.current.schedule).toEqual(on);
    expect(result.current.saved).toBe(true);
    expect(result.current.saveError).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  test('a refused save keeps what was there and says why', async () => {
    mocked.fetchSchedule.mockResolvedValue(off);
    mocked.updateSchedule.mockRejectedValue(new ApiError('Validation failed', 400));
    const { result } = renderHook(() => useScheduleData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.save(values));

    expect(result.current.schedule).toEqual(off);
    expect(result.current.saved).toBe(false);
    expect(result.current.saveError).toBe('Validation failed');
  });

  test('a session that ends during a save is reported as ended', async () => {
    mocked.fetchSchedule.mockResolvedValue(off);
    mocked.updateSchedule.mockRejectedValue(new SessionEndedError());
    const { result } = renderHook(() => useScheduleData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.save(values));

    expect(result.current.sessionEnded).toBe(true);
  });

  test('a second press while one save is going is ignored, not sent twice', async () => {
    mocked.fetchSchedule.mockResolvedValue(off);
    let finish: (view: ScheduleView) => void = () => {};
    mocked.updateSchedule.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useScheduleData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.save(values);
    });
    await waitFor(() => expect(result.current.saving).toBe(true));
    await act(() => result.current.save(values));
    await act(async () => {
      finish(on);
      await first;
    });

    expect(mocked.updateSchedule).toHaveBeenCalledTimes(1);
  });

  test('the "saved" notice clears when the next save begins', async () => {
    mocked.fetchSchedule.mockResolvedValue(off);
    mocked.updateSchedule.mockResolvedValueOnce(on);
    const { result } = renderHook(() => useScheduleData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.save(values));
    expect(result.current.saved).toBe(true);

    mocked.updateSchedule.mockRejectedValueOnce(new ApiError('Nope', 500));
    await act(() => result.current.save(values));

    expect(result.current.saved).toBe(false);
    expect(result.current.saveError).toBe('Nope');
  });
});
