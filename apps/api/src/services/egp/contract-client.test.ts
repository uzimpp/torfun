import { afterEach, describe, expect, test } from 'bun:test';
import type { Env } from '../../config/env';
import { getAllContracts, getAllContractSubmissions } from './contract-client';
import { UpstreamError } from './client';

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
            bidder: [
              {
                merchant_name: `Merchant ${index}`,
                seq_no: 1,
                seq_no_desc: 'Item 1',
                submit_price: 1000,
              },
            ],
          })),
          1001,
        );
      }

      return mockPage(
        [
          {
            bidder: [
              {
                merchant_name: 'Last Merchant',
                seq_no: 1,
                seq_no_desc: 'Item 1',
                submit_price: 2000,
              },
            ],
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
