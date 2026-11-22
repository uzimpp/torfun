import {
  openDataGet,
  OpenDataQuotaBudget,
  OpenDataQuotaExhaustedError,
  UpstreamError,
  sleep,
  type QuotaReading,
} from './client';
import { CONTRACT_URL, CONTRACT_SUBMIT_URL } from './constants';
import { KEYWORD_MIN_SEARCH_LENGTH } from './similar-keyword';
import type { Env } from '../../config/env';
import { POLITENESS } from './constants';

const CONTRACT_API_RETRIES = 2;

export interface EGPContractRecord {
  project_id: string;
  project_name: string;
  announce_date?: string;
  dept_name?: string;
  dept_sub_name?: string;
  project_money?: number;
  price_build?: number;
  /** The API's own aggregate of the agreed prices; used as published. */
  sum_price_agree?: number;
  purchase_method_name?: string;
  year?: number;
  contract: {
    contract_no?: string;
    winner_name?: string;
    winner_tin?: string;
    price_agree?: number;
    contract_date?: string;
    contract_finish_date?: string;
    status?: string;
  }[];
}

/**
 * One line item of a project and the bidders on it (as seen in live samples). `seq_no`
 * and `seq_no_desc` are on the record, not on each bidder, and `submit_price`
 * arrives as a numeric string such as "3000000.00".
 */
export interface EGPContractSubmitRecord {
  seq_no?: number | null;
  seq_no_desc?: string | null;
  bidder: {
    merchant_name?: string | null;
    submit_price?: string | number | null;
  }[];
}

async function getAllPages<T>(
  fetchPage: (
    limit: number,
    offset: number,
  ) => Promise<{
    rows: T[];
    total: number | null;
    quota: QuotaReading;
  }>,
  beforePage?: (offset: number) => Promise<void>,
  onQuota?: (quota: QuotaReading) => void,
  pageSize = 1000,
): Promise<T[]> {
  const allRecords: T[] = [];
  let offset = 0;
  let total: number | null = null;

  while (total === null || offset < total) {
    await beforePage?.(offset);
    if (offset > 0) await sleep(POLITENESS.openDataDelayMs);
    const page = await fetchPage(pageSize, offset);
    onQuota?.(page.quota);

    if (page.total === null) {
      throw new UpstreamError('Invalid total from the GovSpending API');
    }

    if (total !== null && page.total !== total) {
      throw new UpstreamError('GovSpending total changed during pagination');
    }
    total ??= page.total;

    if (page.quota.remainingDay === 0 && offset + page.rows.length < total) {
      throw new OpenDataQuotaExhaustedError();
    }

    if (page.rows.length === 0) {
      if (offset < total) {
        throw new UpstreamError('GovSpending returned an incomplete paginated response');
      }
      break;
    }

    if (page.rows.length > total - offset) {
      throw new UpstreamError('GovSpending returned more rows than its reported total');
    }

    allRecords.push(...page.rows);
    offset += page.rows.length;
  }

  return allRecords;
}

export async function getContracts(
  year: number,
  env: Env,
  limit = 1000,
  offset = 0,
  quotaBudget = new OpenDataQuotaBudget(),
) {
  return openDataGet<EGPContractRecord>(CONTRACT_URL, { year, limit, offset }, env.EGP_API_KEY, {
    maxRetries: CONTRACT_API_RETRIES,
    quotaBudget,
  });
}

/**
 * How many rows one keyword search reads. One page, no paging (the right limit is still
 * an open decision): a keyword that matches more than this is cut and says so
 * through `truncated`. 50 is what the 2026-11-22 tests used; it is not a decision.
 */
export const KEYWORD_SEARCH_PAGE_SIZE = 50;

export interface KeywordSearchResult {
  rows: EGPContractRecord[];
  /** How many rows the API says match; may be more than `rows` holds. */
  total: number | null;
  /** More rows match than were read: the rest were not asked for. */
  truncated: boolean;
  quota: QuotaReading;
}

/**
 * One search of signed contracts by a keyword matched inside the project name, for
 * one contract year (#144). Exactly one request: no paging and no retry, so
 * a failed or refused search is never repeated on its own and costs one call at most.
 * `egp-contract` ignores a `project_id` filter, so a name is the only handle there is;
 * a row found this way is not known to be the project asked about, only to have a
 * name containing the keyword.
 *
 * Refuses, without a request, a keyword that is empty or shorter than the search
 * minimum (it would match a great many unrelated rows) and a year that is not a whole
 * number. Errors carry no key: `openDataGet` removes it.
 */
export async function searchContractsByKeyword(
  keyword: string,
  year: number,
  env: Env,
  quotaBudget = new OpenDataQuotaBudget(),
): Promise<KeywordSearchResult> {
  const text = keyword.trim();
  if (text.length < KEYWORD_MIN_SEARCH_LENGTH) {
    throw new RangeError(
      `A keyword search needs at least ${KEYWORD_MIN_SEARCH_LENGTH} characters, got ${text.length}`,
    );
  }
  if (!Number.isInteger(year)) throw new RangeError('A keyword search needs a whole contract year');

  const page = await openDataGet<EGPContractRecord>(
    CONTRACT_URL,
    { keyword: text, year, limit: KEYWORD_SEARCH_PAGE_SIZE, offset: 0 },
    env.EGP_API_KEY,
    { maxRetries: 0, quotaBudget },
  );
  return {
    rows: page.rows,
    total: page.total,
    truncated: page.total !== null && page.total > page.rows.length,
    quota: page.quota,
  };
}

export async function getContractSubmissions(
  projectId: string,
  year: number,
  env: Env,
  limit = 1000,
  offset = 0,
  quotaBudget = new OpenDataQuotaBudget(),
) {
  return openDataGet<EGPContractSubmitRecord>(
    CONTRACT_SUBMIT_URL,
    {
      project_id: projectId,
      year,
      limit,
      offset,
    },
    env.EGP_API_KEY,
    { maxRetries: CONTRACT_API_RETRIES, quotaBudget },
  );
}

/**
 * One page of a project's bidders for one contract year (#144): exactly one
 * request, no paging and no retry, so the number of calls a caller makes is the number
 * of calls spent. `truncated` is set when more rows match than the page holds, and the
 * caller must not treat such a page as the project's bidders.
 */
export async function fetchProjectSubmissionsOnce(
  projectId: string,
  year: number,
  env: Env,
  quotaBudget = new OpenDataQuotaBudget(),
): Promise<{
  rows: EGPContractSubmitRecord[];
  total: number | null;
  truncated: boolean;
  quota: QuotaReading;
}> {
  const page = await openDataGet<EGPContractSubmitRecord>(
    CONTRACT_SUBMIT_URL,
    { project_id: projectId, year, limit: 1000, offset: 0 },
    env.EGP_API_KEY,
    { maxRetries: 0, quotaBudget },
  );
  return {
    rows: page.rows,
    total: page.total,
    truncated: page.total !== null && page.total > page.rows.length,
    quota: page.quota,
  };
}

export async function getAllContracts(
  year: number,
  env: Env,
  beforePage?: (offset: number) => Promise<void>,
  onQuota?: (quota: QuotaReading) => void,
  quotaBudget = new OpenDataQuotaBudget(),
): Promise<EGPContractRecord[]> {
  return getAllPages(
    (limit, offset) => getContracts(year, env, limit, offset, quotaBudget),
    beforePage,
    onQuota,
  );
}

export async function getAllContractSubmissions(
  projectId: string,
  year: number,
  env: Env,
  beforePage?: (offset: number) => Promise<void>,
  onQuota?: (quota: QuotaReading) => void,
  quotaBudget = new OpenDataQuotaBudget(),
): Promise<EGPContractSubmitRecord[]> {
  return getAllPages(
    (limit, offset) =>
      getContractSubmissions(projectId, year, env, limit, offset, quotaBudget),
    beforePage,
    onQuota,
  );
}
