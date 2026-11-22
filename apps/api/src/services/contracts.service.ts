import type { FastifyBaseLogger } from 'fastify';
import type { Contract, ContractSubmission } from '@torfun/types';
import { randomUUID } from 'node:crypto';
import type { Env } from '../config/env';
import type { ContractEnrichmentStore } from '../repositories/contract-enrichment.repository';
import type { ContractStore } from '../repositories/contract.repository';
import type { ContractSubmissionStore } from '../repositories/contract-submission.repository';
import type { ContractSyncStore } from '../repositories/contract-sync.repository';
import {
  OpenDataForbiddenError,
  OpenDataQuotaBudget,
  OpenDataQuotaExhaustedError,
  RateLimitedError,
  sleep,
  type QuotaReading,
} from './egp/client';
import type { GovSpendingCooldownStore } from '../repositories/govspending-cooldown.repository';
import {
  getAllContractSubmissions,
  getAllContracts,
  type EGPContractRecord,
  type EGPContractSubmitRecord,
} from './egp/contract-client';
import { POLITENESS } from './egp/constants';
import { contractSyncYears } from './egp/dates';

const TASK_LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 15 * 60_000;
const MAX_ERROR_LENGTH = 500;

export interface ContractSyncClient {
  getAllContracts(
    year: number,
    env: Env,
    beforePage?: (offset: number) => Promise<void>,
    onQuota?: (quota: QuotaReading) => void,
    quotaBudget?: OpenDataQuotaBudget,
  ): Promise<EGPContractRecord[]>;
  getAllContractSubmissions(
    projectId: string,
    year: number,
    env: Env,
    beforePage?: (offset: number) => Promise<void>,
    onQuota?: (quota: QuotaReading) => void,
    quotaBudget?: OpenDataQuotaBudget,
  ): Promise<EGPContractSubmitRecord[]>;
}

class ContractSyncStoppedError extends Error {}

class GovSpendingCooldownActiveError extends Error {
  constructor(readonly cooldownUntil: string) {
    super(`GovSpending cooldown is active until ${cooldownUntil}`);
  }
}

interface OpenDataRunBudget {
  requestCount: number;
  quota: OpenDataQuotaBudget;
}

const GOVSPENDING_COOLDOWN_MS = 24 * 60 * 60_000;

function retryAt(error: unknown, now: Date): string {
  if (error instanceof GovSpendingCooldownActiveError) return error.cooldownUntil;
  const delay =
    error instanceof RateLimitedError ||
    error instanceof OpenDataForbiddenError ||
    error instanceof OpenDataQuotaExhaustedError
      ? 24 * 60 * 60_000
      : RETRY_DELAY_MS;
  return new Date(now.getTime() + delay).toISOString();
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

export function contractRecords(rows: EGPContractRecord[], year: number): Contract[] {
  return rows.flatMap((row) => {
    if (!row.project_id || !Array.isArray(row.contract)) {
      throw new Error('GovSpending returned a malformed contract record');
    }

    return row.contract.map((contract) => ({
      projectId: row.project_id,
      contractYear: year,
      contractNo: contract.contract_no ?? null,
      winnerName: contract.winner_name ?? null,
      winnerTin: contract.winner_tin ?? null,
      priceAgree: contract.price_agree ?? null,
      contractDate: contract.contract_date ?? null,
      contractFinishDate: contract.contract_finish_date ?? null,
      status: contract.status ?? null,
      // Project-level figures, as the API publishes them: kept as given, never worked out here.
      sumPriceAgree: numberOrNull(row.sum_price_agree),
      projectMoney: numberOrNull(row.project_money),
      priceBuild: numberOrNull(row.price_build),
    }));
  });
}

/** A figure the API sent as a number; anything else is null, never 0. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A submitted price from the API: a numeric string ("3000000.00") or a number.
 * Anything else — empty, negative, not a number — is null, never 0 and never a
 * guess.
 */
export function parseSubmitPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const price = Number(text);
  return Number.isFinite(price) ? price : null;
}

function lineItemNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export function submissionRecords(
  rows: EGPContractSubmitRecord[],
  projectId: string,
  year: number,
): { records: ContractSubmission[]; unreadablePrices: number } {
  let unreadablePrices = 0;
  const records = rows.flatMap((row) => {
    if (!Array.isArray(row.bidder)) {
      throw new Error('GovSpending returned a malformed contract submission record');
    }

    // seq_no and seq_no_desc describe the line item, so every bidder on it shares them.
    const seqNo = lineItemNumber(row.seq_no);
    const seqNoDesc = row.seq_no_desc ?? null;
    return row.bidder.map((bidder) => {
      const submitPrice = parseSubmitPrice(bidder.submit_price);
      // A price the API did send but we cannot read is counted; an absent one is not a fault.
      if (submitPrice === null && !isBlank(bidder.submit_price)) unreadablePrices += 1;
      return {
        projectId,
        contractYear: year,
        merchantName: bidder.merchant_name ?? null,
        seqNo,
        seqNoDesc,
        submitPrice,
      };
    });
  });
  return { records, unreadablePrices };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

export class ContractsService {
  constructor(
    private readonly contracts: ContractStore,
    private readonly submissions: ContractSubmissionStore,
    private readonly syncs: ContractSyncStore,
    private readonly enrichment: ContractEnrichmentStore,
    private readonly env: Env,
    private readonly logger: FastifyBaseLogger,
    private readonly cooldown: GovSpendingCooldownStore,
    private readonly options: {
      now?: () => Date;
      pause?: (ms: number) => Promise<void>;
      client?: ContractSyncClient;
    } = {},
  ) {}

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }

  private client(): ContractSyncClient {
    return (
      this.options.client ?? {
        getAllContracts,
        getAllContractSubmissions,
      }
    );
  }

  listContracts(projectId: string, contractYear?: number): Promise<Contract[]> {
    return this.contracts.listByProject(projectId, contractYear);
  }

  listSubmissions(projectId: string, contractYear?: number): Promise<ContractSubmission[]> {
    return this.submissions.listByProject(projectId, contractYear);
  }

  async syncAnnual(shouldContinue: () => boolean = () => true): Promise<void> {
    if (await this.isCoolingDown()) return;
    const requestBudget: OpenDataRunBudget = {
      requestCount: 0,
      quota: new OpenDataQuotaBudget(),
    };

    for (const year of contractSyncYears(this.now())) {
      if (!shouldContinue()) return;
      if (await this.isCoolingDown()) return;

      try {
        await this.syncYear(year, shouldContinue, requestBudget);
      } catch (error) {
        if (
          error instanceof RateLimitedError ||
          error instanceof OpenDataForbiddenError ||
          error instanceof OpenDataQuotaExhaustedError ||
          error instanceof GovSpendingCooldownActiveError
        ) {
          this.logger.warn(
            { year, err: error },
            'contract sync failed for year; continuing to next year',
          );
          continue;
        }
        throw error;
      }
      if (!shouldContinue()) return;

      const activeContracts = await this.contracts.listByYear(year);
      const projectIds = [...new Set(activeContracts.map((contract) => contract.projectId))];
      for (const projectId of projectIds) {
        if (!shouldContinue()) return;
        if (await this.isCoolingDown()) return;

        try {
          await this.enrichSubmissions(projectId, year, shouldContinue, requestBudget);
        } catch (error) {
          if (
            error instanceof RateLimitedError ||
            error instanceof OpenDataForbiddenError ||
            error instanceof OpenDataQuotaExhaustedError ||
            error instanceof GovSpendingCooldownActiveError
          ) {
            this.logger.warn(
              { projectId, contractYear: year, err: error },
              'submission enrichment failed for project; continuing to next project',
            );
            continue;
          }
          throw error;
        }
      }
    }
  }

  private async syncYear(
    year: number,
    shouldContinue: () => boolean,
    requestBudget: OpenDataRunBudget,
  ): Promise<void> {
    if (await this.isCoolingDown()) return;

    const started = this.now();
    const claimToken = await this.syncs.claim(
      year,
      started.toISOString(),
      new Date(started.getTime() + TASK_LEASE_MS).toISOString(),
    );
    if (!claimToken) return;

    const generation = randomUUID();
    let publishAttempted = false;
    const beforePage = async (offset: number) => {
      await this.prepareOpenDataPage(offset, shouldContinue, requestBudget, async () => {
        const at = this.now();
        const renewed = await this.syncs.renew(
          year,
          claimToken,
          new Date(at.getTime() + TASK_LEASE_MS).toISOString(),
          at.toISOString(),
        );
        if (!renewed) throw new Error(`Contract sync lease for ${year} was lost`);
      });
    };
    const onQuota = (quota: QuotaReading) => {
      requestBudget.quota.observe(quota);
    };

    try {
      const rows = await this.client().getAllContracts(
        year,
        this.env,
        beforePage,
        onQuota,
        requestBudget.quota,
      );
      await this.persistCooldownIfExhausted(requestBudget);
      const records = contractRecords(rows, year);
      if (!shouldContinue()) throw new ContractSyncStoppedError('Contract sync was stopped');

      await this.contracts.stageYearSnapshot(year, generation, records);
      const at = this.now();
      if (
        !(await this.syncs.renew(
          year,
          claimToken,
          new Date(at.getTime() + TASK_LEASE_MS).toISOString(),
          at.toISOString(),
        ))
      ) {
        throw new Error(`Contract sync lease for ${year} was lost`);
      }
      publishAttempted = true;
      await this.syncs.markCompleted(year, claimToken, at.toISOString(), generation);
    } catch (error) {
      if (!publishAttempted) {
        await this.contracts.discardStagedYearSnapshot(year, generation);
      }
      const at = this.now();
      await this.persistCooldown(error, requestBudget, at);
      await this.syncs.markFailed(year, claimToken, {
        at: at.toISOString(),
        retryAt: error instanceof ContractSyncStoppedError ? at.toISOString() : retryAt(error, at),
        error: errorText(error),
      });

      if (error instanceof ContractSyncStoppedError) return;
      throw error;
    }
  }

  private async enrichSubmissions(
    projectId: string,
    year: number,
    shouldContinue: () => boolean,
    requestBudget: OpenDataRunBudget,
  ): Promise<void> {
    if (await this.isCoolingDown()) return;

    const started = this.now();
    const claimToken = await this.enrichment.claim(
      projectId,
      year,
      'submissions',
      started.toISOString(),
      new Date(started.getTime() + TASK_LEASE_MS).toISOString(),
    );
    if (!claimToken) return;
    const generation = claimToken;
    let publishAttempted = false;

    const beforePage = async (offset: number) => {
      await this.prepareOpenDataPage(offset, shouldContinue, requestBudget, async () => {
        const at = this.now();
        const renewed = await this.enrichment.renew(
          projectId,
          year,
          'submissions',
          claimToken,
          new Date(at.getTime() + TASK_LEASE_MS).toISOString(),
          at.toISOString(),
        );
        if (!renewed)
          throw new Error(`Submission enrichment lease for ${projectId}:${year} was lost`);
      });
    };
    const onQuota = (quota: QuotaReading) => {
      requestBudget.quota.observe(quota);
    };

    try {
      const rows = await this.client().getAllContractSubmissions(
        projectId,
        year,
        this.env,
        beforePage,
        onQuota,
        requestBudget.quota,
      );
      await this.persistCooldownIfExhausted(requestBudget);
      const { records, unreadablePrices } = submissionRecords(rows, projectId, year);
      if (unreadablePrices > 0) {
        // The count only: the unreadable values themselves are not logged.
        this.logger.warn(
          { projectId, contractYear: year, unreadablePrices },
          'contract submissions: some submit_price values could not be read and were stored empty',
        );
      }
      if (!shouldContinue()) throw new ContractSyncStoppedError('Contract enrichment was stopped');

      await this.submissions.stageProjectSnapshot(projectId, year, generation, records);
      const at = this.now().toISOString();
      const renewed = await this.enrichment.renew(
        projectId,
        year,
        'submissions',
        claimToken,
        new Date(this.now().getTime() + TASK_LEASE_MS).toISOString(),
        at,
      );
      if (!renewed)
        throw new Error(`Submission enrichment lease for ${projectId}:${year} was lost`);
      publishAttempted = true;
      await this.enrichment.markCompleted(
        projectId,
        year,
        'submissions',
        claimToken,
        at,
        generation,
      );
    } catch (error) {
      if (!publishAttempted) {
        await this.submissions.discardStagedProjectSnapshot(projectId, year, generation);
      }
      const at = this.now();
      await this.persistCooldown(error, requestBudget, at);
      await this.enrichment.markFailed(projectId, year, 'submissions', claimToken, {
        at: at.toISOString(),
        retryAt: error instanceof ContractSyncStoppedError ? at.toISOString() : retryAt(error, at),
        error: errorText(error),
      });

      if (error instanceof ContractSyncStoppedError) return;
      this.logger.warn(
        { projectId, contractYear: year, err: error },
        'contract submissions enrichment failed; it can be retried later',
      );
      if (
        error instanceof RateLimitedError ||
        error instanceof OpenDataForbiddenError ||
        error instanceof OpenDataQuotaExhaustedError ||
        error instanceof GovSpendingCooldownActiveError
      ) {
        throw error;
      }
    }
  }

  private async prepareOpenDataPage(
    offset: number,
    shouldContinue: () => boolean,
    requestBudget: OpenDataRunBudget,
    renewLease: () => Promise<void>,
  ): Promise<void> {
    if (!shouldContinue()) throw new ContractSyncStoppedError('Contract sync was stopped');
    await this.throwIfCoolingDown();
    if (requestBudget.quota.remainingDay === 0) throw new OpenDataQuotaExhaustedError();

    if (offset === 0 && requestBudget.requestCount > 0) {
      await (this.options.pause ?? sleep)(POLITENESS.openDataDelayMs);
    }

    if (!shouldContinue()) throw new ContractSyncStoppedError('Contract sync was stopped');
    await this.throwIfCoolingDown();
    if (requestBudget.quota.remainingDay === 0) throw new OpenDataQuotaExhaustedError();
    await renewLease();
    requestBudget.requestCount += 1;
  }

  private async isCoolingDown(): Promise<boolean> {
    const cooldownUntil = await this.cooldown.getCooldownUntil();
    return cooldownUntil !== null && cooldownUntil > this.now().toISOString();
  }

  private async throwIfCoolingDown(): Promise<void> {
    const cooldownUntil = await this.cooldown.getCooldownUntil();
    if (cooldownUntil && cooldownUntil > this.now().toISOString()) {
      throw new GovSpendingCooldownActiveError(cooldownUntil);
    }
  }

  private async persistCooldownIfExhausted(requestBudget: OpenDataRunBudget): Promise<void> {
    if (requestBudget.quota.remainingDay === 0) {
      const at = this.now();
      await this.cooldown.extendCooldown(
        new Date(at.getTime() + GOVSPENDING_COOLDOWN_MS).toISOString(),
        at.toISOString(),
      );
    }
  }

  private async persistCooldown(
    error: unknown,
    requestBudget: OpenDataRunBudget,
    at: Date,
  ): Promise<void> {
    if (error instanceof GovSpendingCooldownActiveError) return;
    if (
      requestBudget.quota.remainingDay === 0 ||
      error instanceof RateLimitedError ||
      error instanceof OpenDataForbiddenError ||
      error instanceof OpenDataQuotaExhaustedError
    ) {
      await this.cooldown.extendCooldown(
        new Date(at.getTime() + GOVSPENDING_COOLDOWN_MS).toISOString(),
        at.toISOString(),
      );
    }
  }
}
