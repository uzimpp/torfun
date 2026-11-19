import {
  openDataGet,
  OpenDataQuotaBudget,
  OpenDataQuotaExhaustedError,
  UpstreamError,
  sleep,
  type QuotaReading,
} from './client';
import { CONTRACT_URL, CONTRACT_SUBMIT_URL } from './constants';
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
  /** The API's own aggregate of the agreed prices; used as published (ADR-0022). */
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
 * One line item of a project and the bidders on it (Phase 0, ADR-0022). `seq_no`
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
