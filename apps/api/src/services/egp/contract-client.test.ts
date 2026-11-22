import { afterEach, describe, expect, test } from 'bun:test';
import type { Env } from '../../config/env';
import {
  getAllContracts,
  fetchProjectSubmissionsOnce,
  getAllContractSubmissions,
  KEYWORD_SEARCH_PAGE_SIZE,
  searchContractsByKeyword,
} from './contract-client';
import { KEYWORD_MIN_SEARCH_LENGTH } from './similar-keyword';
import { OpenDataQuotaBudget, RateLimitedError, UpstreamError } from './client';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = {
  EGP_API_KEY: 'test-api-key',
} as Env;

function mockPage(data: unknown[], total: number, remainingDay?: number) {
  return new Response(
    JSON.stringify({
      success: true,
      total,
      data,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        ...(remainingDay === undefined
          ? {}
          : { 'x-ratelimit-remaining-day': String(remainingDay) }),
      },
    },
  );
}

describe('getAllContracts', () => {
  test('fetches all pages when there are more than 1000 records', async () => {
    const calls: URL[] = [];

    globalThis.fetch = (async (input: URL | Request | string) => {
      const url = new URL(input.toString());
      calls.push(url);

      const offset = Number(url.searchParams.get('offset'));

      if (offset === 0) {
        return mockPage(
          Array.from({ length: 1000 }, (_, index) => ({
            project_id: `project-${index}`,
            project_name: `Project ${index}`,
            contract: [],
          })),
          1501,
        );
      }

      return mockPage(
        Array.from({ length: 501 }, (_, index) => ({
          project_id: `project-${1000 + index}`,
          project_name: `Project ${1000 + index}`,
          contract: [],
        })),
        1501,
      );
    }) as unknown as typeof fetch;

    const records = await getAllContracts(2569, env);

    expect(records).toHaveLength(1501);
    expect(calls).toHaveLength(2);

    expect(calls[0]!.searchParams.get('year')).toBe('2569');
    expect(calls[0]!.searchParams.get('limit')).toBe('1000');
    expect(calls[0]!.searchParams.get('offset')).toBe('0');

    expect(calls[1]!.searchParams.get('offset')).toBe('1000');
  });

  test('stops after the first page when there are no records', async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      return mockPage([], 0);
    }) as unknown as typeof fetch;

    const records = await getAllContracts(2569, env);

    expect(records).toEqual([]);
    expect(calls).toBe(1);
  });

  test('does not request another page after the API reports an exhausted quota', async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      return mockPage(
        [{ project_id: 'project-1', project_name: 'Project 1', contract: [] }],
        2,
        0,
      );
    }) as unknown as typeof fetch;

    await expect(getAllContracts(2569, env)).rejects.toThrow(
      'GovSpending daily request quota is exhausted',
    );
    expect(calls).toBe(1);
  });

  test('does not publish an incomplete result when a page is unexpectedly empty', async () => {
    globalThis.fetch = (async () => mockPage([], 10)) as unknown as typeof fetch;

    await expect(getAllContracts(2569, env)).rejects.toBeInstanceOf(UpstreamError);
  });

  test('does not publish a result when the reported total changes between pages', async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      return mockPage(
        Array.from({ length: 1000 }, (_, index) => ({
          project_id: `project-${index}`,
          project_name: `Project ${index}`,
          contract: [],
        })),
        calls === 1 ? 1500 : 1600,
      );
    }) as unknown as typeof fetch;

    await expect(getAllContracts(2569, env)).rejects.toThrow(
      'GovSpending total changed during pagination',
    );
    expect(calls).toBe(2);
  });

  test('does not treat a missing total as a complete empty snapshot', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    await expect(getAllContracts(2569, env)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe('getAllContractSubmissions', () => {
  test('fetches all pages for a project', async () => {
    const calls: URL[] = [];

    globalThis.fetch = (async (input: URL | Request | string) => {
      const url = new URL(input.toString());
      calls.push(url);

      const offset = Number(url.searchParams.get('offset'));

      if (offset === 0) {
        return mockPage(
          Array.from({ length: 1000 }, (_, index) => ({
            seq_no: 1,
            seq_no_desc: 'Item 1',
            bidder: [{ merchant_name: `Merchant ${index}`, submit_price: '1000.00' }],
          })),
          1001,
        );
      }

      return mockPage(
        [
          {
            seq_no: 1,
            seq_no_desc: 'Item 1',
            bidder: [{ merchant_name: 'Last Merchant', submit_price: '2000.00' }],
          },
        ],
        1001,
      );
    }) as unknown as typeof fetch;

    const records = await getAllContractSubmissions('project-123', 2569, env);

    expect(records).toHaveLength(1001);
    expect(calls).toHaveLength(2);

    expect(calls[0]!.searchParams.get('project_id')).toBe('project-123');
    expect(calls[0]!.searchParams.get('year')).toBe('2569');
    expect(calls[0]!.searchParams.get('limit')).toBe('1000');
    expect(calls[0]!.searchParams.get('offset')).toBe('0');

    expect(calls[1]!.searchParams.get('offset')).toBe('1000');
  });
});

describe('open-data response handling', () => {
  test('the api-key the API echoes in `request` never reaches the returned records', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          total: 1,
          // The real API repeats the caller's parameters, key included, in every body.
          request: { 'api-key': env.EGP_API_KEY, year: 2569, project_id: 'project-123' },
          data: [{ seq_no: 1, seq_no_desc: 'Item 1', bidder: [] }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;

    const records = await getAllContractSubmissions('project-123', 2569, env);

    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain(env.EGP_API_KEY);
    expect(JSON.stringify(records)).not.toContain('api-key');
  });
});

describe('searchContractsByKeyword', () => {
  const keyword = 'บำรุงรักษาระบบสารสนเทศภูมิศาสตร์ (GIS) และระบบสารสนเทศการบริหาร';
  const row = (id: string) => ({ project_id: id, project_name: `Project ${id}`, contract: [] });

  test('makes exactly one request, with the keyword, the year, one page and no offset', async () => {
    const calls: URL[] = [];
    globalThis.fetch = (async (input: URL | Request | string) => {
      calls.push(new URL(input.toString()));
      return mockPage([row('a')], 1, 900);
    }) as unknown as typeof fetch;

    const result = await searchContractsByKeyword(keyword, 2569, env);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.searchParams.get('keyword')).toBe(keyword);
    expect(calls[0]!.searchParams.get('year')).toBe('2569');
    expect(calls[0]!.searchParams.get('limit')).toBe(String(KEYWORD_SEARCH_PAGE_SIZE));
    expect(calls[0]!.searchParams.get('offset')).toBe('0');
    // It is a search by name, so it never claims to look a project up by its id.
    expect(calls[0]!.searchParams.has('project_id')).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(result.quota.remainingDay).toBe(900);
  });

  test('a keyword is sent trimmed', async () => {
    const calls: URL[] = [];
    globalThis.fetch = (async (input: URL | Request | string) => {
      calls.push(new URL(input.toString()));
      return mockPage([], 0);
    }) as unknown as typeof fetch;

    await searchContractsByKeyword(`  ${keyword}  `, 2569, env);

    expect(calls[0]!.searchParams.get('keyword')).toBe(keyword);
  });

  test('more matches than one page is reported as truncated, and the rest is never asked for', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return mockPage(
        Array.from({ length: KEYWORD_SEARCH_PAGE_SIZE }, (_, index) => row(`p${index}`)),
        KEYWORD_SEARCH_PAGE_SIZE + 30,
      );
    }) as unknown as typeof fetch;

    const result = await searchContractsByKeyword(keyword, 2568, env);

    expect(requests).toBe(1);
    expect(result.rows).toHaveLength(KEYWORD_SEARCH_PAGE_SIZE);
    expect(result.total).toBe(KEYWORD_SEARCH_PAGE_SIZE + 30);
    expect(result.truncated).toBe(true);
  });

  test('exactly one full page is not truncated', async () => {
    globalThis.fetch = (async () =>
      mockPage(
        Array.from({ length: KEYWORD_SEARCH_PAGE_SIZE }, (_, index) => row(`p${index}`)),
        KEYWORD_SEARCH_PAGE_SIZE,
      )) as unknown as typeof fetch;

    expect((await searchContractsByKeyword(keyword, 2568, env)).truncated).toBe(false);
  });

  test('no match is an empty result, not an error', async () => {
    globalThis.fetch = (async () => mockPage([], 0)) as unknown as typeof fetch;

    const result = await searchContractsByKeyword(keyword, 2567, env);

    expect(result).toMatchObject({ rows: [], total: 0, truncated: false });
  });

  test.each([
    ['empty', ''],
    ['only spaces', '                         '],
    ['one character under the minimum', 'ก'.repeat(KEYWORD_MIN_SEARCH_LENGTH - 1)],
    ['padded with spaces to look long enough', `  ${'ก'.repeat(KEYWORD_MIN_SEARCH_LENGTH - 1)}  `],
  ])('refuses a keyword that is %s, with no request', async (_label, bad) => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return mockPage([], 0);
    }) as unknown as typeof fetch;

    await expect(searchContractsByKeyword(bad, 2569, env)).rejects.toThrow(RangeError);
    expect(requests).toBe(0);
  });

  test('a keyword of exactly the minimum is searched', async () => {
    globalThis.fetch = (async () => mockPage([], 0)) as unknown as typeof fetch;

    await expect(
      searchContractsByKeyword('ก'.repeat(KEYWORD_MIN_SEARCH_LENGTH), 2569, env),
    ).resolves.toMatchObject({ rows: [] });
  });

  test.each([2569.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a year of %p, with no request',
    async (year) => {
      let requests = 0;
      globalThis.fetch = (async () => {
        requests += 1;
        return mockPage([], 0);
      }) as unknown as typeof fetch;

      await expect(searchContractsByKeyword(keyword, year, env)).rejects.toThrow(RangeError);
      expect(requests).toBe(0);
    },
  );

  test('a refusal (429) is thrown at once and is not repeated', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response('{}', { status: 429, headers: { 'x-ratelimit-remaining-day': '0' } });
    }) as unknown as typeof fetch;

    await expect(searchContractsByKeyword(keyword, 2569, env)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(requests).toBe(1);
  });

  test('a server error is not retried: it costs one call at most', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response('error', { status: 500 });
    }) as unknown as typeof fetch;

    await expect(searchContractsByKeyword(keyword, 2569, env)).rejects.toThrow();
    expect(requests).toBe(1);
  });

  test('an error never carries the api-key', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, message: `bad key ${env.EGP_API_KEY}` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

    const error = await searchContractsByKeyword(keyword, 2569, env).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as Error).message).not.toContain(env.EGP_API_KEY);
  });

  test('the api-key the API echoes in `request` never reaches the returned rows', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          total: 1,
          request: { 'api-key': env.EGP_API_KEY, keyword, year: 2569 },
          data: [row('a')],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;

    const result = await searchContractsByKeyword(keyword, 2569, env);

    expect(JSON.stringify(result)).not.toContain(env.EGP_API_KEY);
    expect(JSON.stringify(result)).not.toContain('api-key');
  });

  test('the day allowance the caller holds is the one the request is counted against', async () => {
    const budget = new OpenDataQuotaBudget(5);
    globalThis.fetch = (async () => mockPage([], 0, 4)) as unknown as typeof fetch;

    await searchContractsByKeyword(keyword, 2569, env, budget);

    expect(budget.remainingDay).toBeLessThanOrEqual(4);
  });
});

describe('fetchProjectSubmissionsOnce', () => {
  const bidder = { seq_no: 1, seq_no_desc: 'Item 1', bidder: [] };

  test('makes exactly one request, by the project id and the year, with no offset', async () => {
    const calls: URL[] = [];
    globalThis.fetch = (async (input: URL | Request | string) => {
      calls.push(new URL(input.toString()));
      return mockPage([bidder], 1);
    }) as unknown as typeof fetch;

    const result = await fetchProjectSubmissionsOnce('project-9', 2569, env);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.searchParams.get('project_id')).toBe('project-9');
    expect(calls[0]!.searchParams.get('year')).toBe('2569');
    expect(calls[0]!.searchParams.get('offset')).toBe('0');
    expect(result.rows).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  test('a page that is not the whole list is reported as truncated, and no more is asked', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return mockPage([bidder], 5);
    }) as unknown as typeof fetch;

    const result = await fetchProjectSubmissionsOnce('project-9', 2569, env);

    expect(requests).toBe(1);
    expect(result.truncated).toBe(true);
  });

  test('is not retried after a server error: it costs one call', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response('error', { status: 500 });
    }) as unknown as typeof fetch;

    await expect(fetchProjectSubmissionsOnce('project-9', 2569, env)).rejects.toThrow();
    expect(requests).toBe(1);
  });

  test('a refusal (429) is thrown at once', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;

    await expect(fetchProjectSubmissionsOnce('project-9', 2569, env)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});
