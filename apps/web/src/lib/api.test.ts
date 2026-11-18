import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createCompany,
  deleteClient,
  deleteExperience,
  downloadTor,
  fetchClients,
  fetchFiscalYears,
  fetchProjects,
  joinCompany,
  stopIngestionRun,
} from './api';

/**
 * These tests are about the shape of the request on the wire, not the answer.
 *
 * Fastify rejects a request that declares `application/json` and then sends no
 * body — `FST_ERR_CTP_EMPTY_JSON_BODY`, surfaced to an officer as "Body cannot
 * be empty when content-type is set to 'application/json'". Every call below
 * that carries no body must therefore not claim to be sending JSON.
 */

const headersOf = (call: unknown[]) => new Headers((call[1] as RequestInit).headers as HeadersInit);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('a request that sends no body', () => {
  test.each([
    ['joining a company', () => joinCompany('68b1f0c2a1b2c3d4e5f60718')],
    ['stopping a run', () => stopIngestionRun()],
    ['deleting a client', () => deleteClient('68b1f0c2a1b2c3d4e5f60719')],
    ['deleting an experience', () => deleteExperience('68b1f0c2a1b2c3d4e5f6071a')],
    ['reading the client list', () => fetchClients()],
  ])('%s does not claim a JSON content-type', async (_label, call) => {
    await call();
    expect(fetchMock).toHaveBeenCalledOnce();
    const call0 = fetchMock.mock.calls[0]!;
    expect((call0[1] as RequestInit).body).toBeUndefined();
    expect(headersOf(call0).has('Content-Type')).toBe(false);
  });
});

test('a request that does send a body still declares JSON', async () => {
  await createCompany({ name_th: 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)' });
  const call0 = fetchMock.mock.calls[0]!;
  expect(headersOf(call0).get('Content-Type')).toBe('application/json');
});

test('an explicit content-type from the caller is still honoured', async () => {
  await createCompany({ name_th: 'x' });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/companies'),
    expect.objectContaining({ credentials: 'include', method: 'POST' }),
  );
});

test('procurement filters are encoded into the existing listing request', async () => {
  await fetchProjects({
    q: 'ระบบ',
    minBudget: 500_000,
    techStack: ['React', 'PostgreSQL'],
    targetPlatforms: ['web_app', 'mobile'],
    limit: 20,
    offset: 20,
  });

  const url = new URL(fetchMock.mock.calls[0]![0] as string);
  expect(url.pathname).toBe('/api/tors');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: 'ระบบ',
    minBudget: '500000',
    techStack: 'React,PostgreSQL',
    targetPlatforms: 'web_app,mobile',
    limit: '20',
    offset: '20',
  });
});

test('fiscal year choices are loaded from the procurement index', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ years: [2570, 2569, 2560] }), { status: 200 }),
  );

  await expect(fetchFiscalYears()).resolves.toEqual({ years: [2570, 2569, 2560] });
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/tors/years'),
    expect.objectContaining({ credentials: 'include' }),
  );
});

/**
 * The TOR source is agency-supplied bytes. Whatever `Content-Type` the response
 * claims, the web app decides the type itself, from the content (ASVS V3.2.1).
 */
describe('downloading the original TOR', () => {
  const respond = (body: string, type: string) =>
    fetchMock.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'Content-Type': type } }),
    );

  test('a real PDF is returned typed application/pdf, even when mislabelled', async () => {
    respond('%PDF-1.7 body', 'application/octet-stream');

    const blob = await downloadTor('project-123');

    expect(blob.type).toBe('application/pdf');
    // jsdom's Blob has no text(); the byte count shows the body survived intact.
    expect(blob.size).toBe('%PDF-1.7 body'.length);
    expect(fetchMock.mock.calls[0]![0]).toContain('/api/tors/project-123/source');
  });

  test.each([
    ['HTML served as a PDF', '<!doctype html><script>alert(1)</script>', 'application/pdf'],
    ['an SVG', '<svg onload="alert(1)"/>', 'image/svg+xml'],
    ['an empty body', '', 'application/pdf'],
  ])('refuses %s', async (_label, body, type) => {
    respond(body, type);

    await expect(downloadTor('project-123')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
    });
  });

  test('the project id is encoded into the path', async () => {
    respond('%PDF-1.7', 'application/pdf');

    await downloadTor('a/b?c');

    expect(fetchMock.mock.calls[0]![0]).toContain('/api/tors/a%2Fb%3Fc/source');
  });
});
