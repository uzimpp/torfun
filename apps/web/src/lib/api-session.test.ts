import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * The access cookie lives fifteen minutes and only page navigation renewed it,
 * so a console left polling went dark at the fifteen-minute mark. These tests
 * pin the behaviour that replaces that: a 401 on a data call is answered with
 * one refresh and one retry, and a refresh the API refuses is reported as the
 * session having ended rather than as a generic failure.
 *
 * A fresh module per test, because the in-flight refresh is module state.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const isRefresh = (url: unknown) => String(url).endsWith('/api/auth/refresh');

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import('./api');
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('an expired access cookie', () => {
  test('a data call that gets a 401 refreshes once and is retried', async () => {
    let dataCalls = 0;
    fetchMock.mockImplementation(async (url: unknown) => {
      if (isRefresh(url)) return json({ message: 'Session refreshed' });
      dataCalls += 1;
      return dataCalls === 1 ? json({ message: 'Unauthorized' }, 401) : json({ items: [] });
    });
    const { fetchFailures } = await load();

    await expect(fetchFailures()).resolves.toEqual({ items: [] });

    const refreshes = fetchMock.mock.calls.filter(([url]) => isRefresh(url));
    expect(refreshes).toHaveLength(1);
    expect((refreshes[0]![1] as RequestInit).method).toBe('POST');
    expect((refreshes[0]![1] as RequestInit).credentials).toBe('include');
    expect(dataCalls).toBe(2);
  });

  test('concurrent 401s share one refresh, because refresh tokens rotate', async () => {
    let refreshed = false;
    fetchMock.mockImplementation(async (url: unknown) => {
      if (isRefresh(url)) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        refreshed = true;
        return json({ message: 'Session refreshed' });
      }
      return refreshed ? json({ items: [] }) : json({ message: 'Unauthorized' }, 401);
    });
    const { fetchFailures } = await load();

    await Promise.all([fetchFailures(), fetchFailures(), fetchFailures()]);

    expect(fetchMock.mock.calls.filter(([url]) => isRefresh(url))).toHaveLength(1);
  });

  test('a call that was already in flight before a refresh is retried, not refreshed again', async () => {
    let refreshed = false;
    let releaseSlow: (() => void) | undefined;
    fetchMock.mockImplementation(async (url: unknown) => {
      if (isRefresh(url)) {
        refreshed = true;
        return json({ message: 'Session refreshed' });
      }
      if (String(url).includes('/failures') && !refreshed) {
        return json({ message: 'Unauthorized' }, 401);
      }
      if (String(url).includes('/summary') && !refreshed) {
        // Sent with the old cookie, answered only after the refresh completed.
        await new Promise<void>((resolve) => (releaseSlow = resolve));
        return json({ message: 'Unauthorized' }, 401);
      }
      return json({ ok: true });
    });
    const { fetchFailures, fetchSummary } = await load();

    const slow = fetchSummary();
    await fetchFailures();
    releaseSlow?.();
    await slow;

    expect(fetchMock.mock.calls.filter(([url]) => isRefresh(url))).toHaveLength(1);
  });

  test('a refresh the API refuses is reported as an ended session, not retried', async () => {
    fetchMock.mockImplementation(async (url: unknown) =>
      isRefresh(url)
        ? json({ message: 'Invalid refresh token' }, 401)
        : json({ message: 'x' }, 401),
    );
    const { fetchFailures, ApiError, SessionEndedError } = await load();

    const error = await fetchFailures().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SessionEndedError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).status).toBe(401);
    // The data call ran once and the refresh once; nothing loops.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a second 401 after a successful refresh is an ended session, not another refresh', async () => {
    fetchMock.mockImplementation(async (url: unknown) =>
      isRefresh(url) ? json({ message: 'ok' }) : json({ message: 'Unauthorized' }, 401),
    );
    const { fetchFailures, SessionEndedError } = await load();

    await expect(fetchFailures()).rejects.toBeInstanceOf(SessionEndedError);
    expect(fetchMock.mock.calls.filter(([url]) => isRefresh(url))).toHaveLength(1);
  });

  test('an unreachable API during a refresh keeps the cannot-reach error', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (isRefresh(url)) throw new TypeError('fetch failed');
      return json({ message: 'Unauthorized' }, 401);
    });
    const { fetchFailures, SessionEndedError } = await load();

    const error = await fetchFailures().catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(SessionEndedError);
    expect((error as Error).message).toMatch(/Cannot reach the API/);
  });
});

describe('the auth endpoints', () => {
  test('are never refreshed: a failed login is a 401 to show, not a session to renew', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Invalid credentials' }, 401));
    const { apiFetch } = await load();

    const response = await apiFetch('/api/auth/login', { method: 'POST', body: '{}' });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the other request helpers', () => {
  test('a body-less DELETE also survives an expired cookie', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (url: unknown) => {
      if (isRefresh(url)) return json({ message: 'ok' });
      calls += 1;
      return calls === 1
        ? json({ message: 'Unauthorized' }, 401)
        : new Response(null, { status: 204 });
    });
    const { deleteClient } = await load();

    await expect(deleteClient('68b1f0c2a1b2c3d4e5f60719')).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
