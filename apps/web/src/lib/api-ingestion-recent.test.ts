import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchRecent', () => {
  test('asks for the most recently updated procurements, five by default', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    const { fetchRecent } = await import('./api-ingestion-recent');

    await expect(fetchRecent()).resolves.toEqual({ items: [] });

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/ingestion\/recent\?limit=5$/);
  });

  test('passes an explicit limit through', async () => {
    fetchMock.mockResolvedValue(json({ items: [] }));
    const { fetchRecent } = await import('./api-ingestion-recent');

    await fetchRecent(12);

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/limit=12$/);
  });

  test('turns an API refusal into an ApiError carrying its status', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Forbidden' }, 403));
    const { fetchRecent } = await import('./api-ingestion-recent');
    const { ApiError } = await import('./api');

    await expect(fetchRecent()).rejects.toMatchObject({ status: 403, message: 'Forbidden' });
    await expect(fetchRecent()).rejects.toBeInstanceOf(ApiError);
  });
});
