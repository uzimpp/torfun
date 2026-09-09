import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteClient, deleteExperience, fetchClients, joinCompany, createCompany } from './api';

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
