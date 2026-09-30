import { afterEach, describe, expect, test } from 'bun:test';
import contractRow from './fixtures/contract-row.json';
import { discoverProjects, toRecord, type ContractRow } from './discovery';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (rows: unknown[], total = rows.length) =>
  new Response(JSON.stringify({ success: true, total, data: rows }), { status: 200 });

describe('discoverProjects when the open-data API says stop', () => {
  test('a 429 on the first call ends the sweep at once instead of trying every agency', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      return new Response('', { status: 429 });
    }) as unknown as typeof fetch;

    const result = await discoverProjects('SECRET-KEY-123');

    expect(urls).toHaveLength(1);
    expect(result.rateLimited).toBe(true);
    expect(result.records).toEqual([]);
    // Said once, with no credential in it.
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toMatch(/429/);
    expect(result.failures[0]?.error).not.toContain('SECRET-KEY-123');
  });

  test('a 429 part-way through keeps what was found and stops asking', async () => {
    let calls = 0;
    globalThis.fetch = (async (url: string) => {
      calls += 1;
      const endpoint = new URL(String(url));
      if (endpoint.pathname.endsWith('/egp-dept')) {
        const name = endpoint.searchParams.get('dept_name');
        return json([{ dept_code: '0305', dept_name: name }]);
      }
      // The first contract query answers; the second is refused.
      if (calls <= 6) {
        return json([
          {
            project_id: '111',
            project_name: 'จ้างพัฒนาระบบสารสนเทศ',
            dept_name: 'กรมศุลกากร',
            year: 2568,
            purchase_method_name: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
          },
        ]);
      }
      return new Response('', { status: 429 });
    }) as unknown as typeof fetch;

    const result = await discoverProjects('k');
    const callsAtStop = calls;

    expect(result.rateLimited).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);
    // One refusal, then nothing more — not a further call per remaining keyword.
    expect(callsAtStop).toBeLessThanOrEqual(8);
  });

  test('an ordinary failure is still logged and the sweep carries on', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await discoverProjects('k');

    expect(result.rateLimited).toBe(false);
    expect(calls).toBeGreaterThan(1);
  });
});

/**
 * Captured from one read-only `egp-contract` response on 2026-09-30. Keeping
 * the upstream snake_case fixture here makes field-name drift visible without
 * calling the government API during tests.
 */
describe('e-GP contract row mapping', () => {
  test('maps the real administrative location fields and Thai announcement date', () => {
    const row = contractRow satisfies ContractRow;
    const record = toRecord(row, 'กรุงเทพมหานคร', '3100001', 2569, 'ระบบสารสนเทศ');

    expect(record).toMatchObject({
      projectId: '68069070986',
      province: 'กรุงเทพมหานคร',
      district: 'ดินแดง',
      subdistrict: 'ดินแดง',
      announceDate: '2025-08-01T00:00:00.000Z',
    });
  });
});
