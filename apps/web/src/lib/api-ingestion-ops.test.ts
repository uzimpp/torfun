import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchIngestionOps', () => {
  test('reads the operations view with the session cookie', async () => {
    const body = { runs: [] };
    fetchMock.mockResolvedValue(json(body));
    const { fetchIngestionOps } = await import('./api-ingestion-ops');

    await expect(fetchIngestionOps()).resolves.toEqual(body);

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/ingestion\/ops$/);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  test('turns a refusal into an ApiError carrying its status', async () => {
    fetchMock.mockImplementation(async () => json({ message: 'Forbidden' }, 403));
    const { fetchIngestionOps } = await import('./api-ingestion-ops');
    const { ApiError } = await import('./api');

    await expect(fetchIngestionOps()).rejects.toBeInstanceOf(ApiError);
    await expect(fetchIngestionOps()).rejects.toMatchObject({ status: 403, message: 'Forbidden' });
  });
});
