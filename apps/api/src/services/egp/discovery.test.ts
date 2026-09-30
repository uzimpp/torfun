import { afterEach, describe, expect, test } from 'bun:test';
import { OPEN_DATA_RESERVE } from './constants';
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

describe('discoverProjects and the daily quota', () => {
  /** Answers every call with an empty page, reporting a falling allowance. */
  const countingDown = (start: number) => {
    let remaining = start;
    const calls = { count: 0 };
    globalThis.fetch = (async (url: string) => {
      calls.count += 1;
      remaining -= 1;
      const isDept = new URL(String(url)).pathname.endsWith('/egp-dept');
      const rows = isDept ? [{ dept_code: '0305', dept_name: 'กรมศุลกากร' }] : [];
      return new Response(JSON.stringify({ success: true, total: rows.length, data: rows }), {
        status: 200,
        headers: {
          'x-ratelimit-limit-day': '1000',
          'x-ratelimit-remaining-day': String(remaining),
        },
      });
    }) as unknown as typeof fetch;
    return calls;
  };

  test('reports the last allowance it was told about', async () => {
    // Close to the reserve, so the sweep ends after a few calls and the test is quick.
    countingDown(OPEN_DATA_RESERVE + 4);

    const result = await discoverProjects('k');

    expect(result.quota?.limitDay).toBe(1000);
    expect(result.quota?.remainingDay).toBeLessThanOrEqual(OPEN_DATA_RESERVE + 3);
    expect(result.quota?.observedAt).toMatch(/^\d{4}-/);
  });

  test('stops before the allowance runs out, leaving a reserve, and is not a rate limit', async () => {
    const calls = countingDown(OPEN_DATA_RESERVE + 8);

    const result = await discoverProjects('k');

    expect(result.budgetReached).toBe(true);
    expect(result.rateLimited).toBe(false);
    expect(result.quota?.remainingDay).toBeLessThanOrEqual(OPEN_DATA_RESERVE);
    expect(result.quota?.remainingDay).toBeGreaterThanOrEqual(OPEN_DATA_RESERVE - 1);
    expect(calls.count).toBeLessThan(15); // not the ~270 a full sweep makes
  });

  test('a refusal means nothing is left today', async () => {
    globalThis.fetch = (async () =>
      new Response('', {
        status: 429,
        headers: { 'x-ratelimit-limit-day': '1000', 'x-ratelimit-remaining-day': '0' },
      })) as unknown as typeof fetch;

    const result = await discoverProjects('k');

    expect(result.rateLimited).toBe(true);
    expect(result.quota?.remainingDay).toBe(0);
  });

  test('a response that says nothing about the allowance leaves it unknown', async () => {
    globalThis.fetch = (async () => json([])) as unknown as typeof fetch;

    const result = await discoverProjects('k');

    expect(result.quota).toBeNull();
    expect(result.budgetReached).toBe(false);
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
