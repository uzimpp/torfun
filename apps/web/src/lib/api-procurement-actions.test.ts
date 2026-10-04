import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let fetchMock: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  const [actions, api] = await Promise.all([import('./api-procurement-actions'), import('./api')]);
  return { ...actions, ApiError: api.ApiError };
}

const noContent = () => new Response(null, { status: 204 });

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(noContent());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), method: (init as RequestInit).method };
};

describe('administrator actions on a procurement', () => {
  test('approve posts to the project’s approve address', async () => {
    const { approveProcurement } = await load();
    await approveProcurement('66059313551');
    expect(lastCall()).toMatchObject({ method: 'POST' });
    expect(lastCall().url).toMatch(/\/api\/ingestion\/procurements\/66059313551\/approve$/);
  });

  test('mark as non-software posts to its own address', async () => {
    const { markNonSoftware } = await load();
    await markNonSoftware('66059313551');
    expect(lastCall()).toMatchObject({ method: 'POST' });
    expect(lastCall().url).toMatch(/\/procurements\/66059313551\/non-software$/);
  });

  test.each([
    [true, 'true'],
    [false, 'false'],
  ])('delete with allowReimport=%s says so explicitly in the query', async (allow, expected) => {
    const { deleteProcurement } = await load();
    await deleteProcurement('66059313551', allow);
    expect(lastCall()).toMatchObject({ method: 'DELETE' });
    expect(lastCall().url).toMatch(
      new RegExp(`/procurements/66059313551\\?allowReimport=${expected}$`),
    );
  });

  test('a refusal carries the status and the server’s message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not held' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { approveProcurement, ApiError } = await load();

    const error = await approveProcurement('1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Not held' });
  });
});
