import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SCHEDULE } from '@torfun/types';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const view = {
  ...DEFAULT_SCHEDULE,
  lastRunAt: null,
  nextRunAt: null,
  upcomingRunAts: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  const [schedule, api] = await Promise.all([import('./api-schedule'), import('./api')]);
  return { ...schedule, ApiError: api.ApiError, SessionEndedError: api.SessionEndedError };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchSchedule', () => {
  test('reads the schedule with the session cookie', async () => {
    fetchMock.mockResolvedValue(json(view));
    const { fetchSchedule } = await load();

    await expect(fetchSchedule()).resolves.toEqual(view);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/ingestion\/schedule$/);
    expect((init as RequestInit).credentials).toBe('include');
  });

  test('turns a failure into an ApiError carrying the status and the server message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Forbidden' }, 403));
    const { fetchSchedule, ApiError } = await load();

    const error = await fetchSchedule().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).status).toBe(403);
    expect((error as Error).message).toBe('Forbidden');
  });
});

describe('updateSchedule', () => {
  const update = {
    enabled: true,
    mode: 'interval' as const,
    timeOfDay: '02:00',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    everyHours: 12,
  };

  test('PUTs the five fields as JSON', async () => {
    fetchMock.mockResolvedValue(json({ ...view, ...update }));
    const { updateSchedule } = await load();

    await updateSchedule(update);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/ingestion\/schedule$/);
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(update);
    expect(((init as RequestInit).headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  test('a refused save keeps the server message so it can be shown', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Validation failed' }, 400));
    const { updateSchedule } = await load();

    await expect(updateSchedule(update)).rejects.toThrow('Validation failed');
  });

  test('a session that has ended surfaces as such, not as a failed save', async () => {
    // Every call, the data one and the refresh, is refused.
    fetchMock.mockResolvedValue(json({ message: 'Unauthorized' }, 401));
    const { updateSchedule, SessionEndedError } = await load();

    await expect(updateSchedule(update)).rejects.toBeInstanceOf(SessionEndedError);
  });
});
