import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  const [tombstones, api] = await Promise.all([import('./api-tombstones'), import('./api')]);
  return { ...tombstones, ApiError: api.ApiError };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchTombstones', () => {
  test('reads the dropped projects with the session cookie', async () => {
    fetchMock.mockResolvedValue(json({ items: [{ projectId: '1' }] }));
    const { fetchTombstones } = await load();

    await expect(fetchTombstones()).resolves.toEqual([{ projectId: '1' }]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/ingestion\/tombstones$/);
    expect((init as RequestInit).credentials).toBe('include');
  });

  test('a refusal becomes an ApiError with the status and the server message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Forbidden' }, 403));
    const { fetchTombstones, ApiError } = await load();

    const error = await fetchTombstones().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: 'Forbidden' });
  });
});

describe('restoreTombstone', () => {
  test('posts to the project’s restore address and accepts the 202', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    const { restoreTombstone } = await load();

    await expect(restoreTombstone('66059313551')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/ingestion\/tombstones\/66059313551\/restore$/);
    expect((init as RequestInit).method).toBe('POST');
  });

  test('a refusal becomes an ApiError carrying the server message', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Another run is going' }, 409));
    const { restoreTombstone, ApiError } = await load();

    const error = await restoreTombstone('1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Another run is going' });
  });
});

describe('removeTombstone', () => {
  test('deletes only the tombstone at the project’s address', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { removeTombstone } = await load();

    await removeTombstone('66059313551');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/ingestion\/tombstones\/66059313551$/);
    expect((init as RequestInit).method).toBe('DELETE');
  });
});
