import { describe, expect, test } from 'bun:test';
import type { FastifyBaseLogger } from 'fastify';
import type { Contract, ContractSubmission } from '@torfun/types';
import type { ContractEnrichmentStore } from '../repositories/contract-enrichment.repository';
import type { ContractStore } from '../repositories/contract.repository';
import type { ContractSubmissionStore } from '../repositories/contract-submission.repository';
import type { ContractSyncStore } from '../repositories/contract-sync.repository';
import type { GovSpendingCooldownStore } from '../repositories/govspending-cooldown.repository';
import {
  OpenDataQuotaExhaustedError,
  RateLimitedError,
} from './egp/client';
import type { OpenDataQuotaBudget, QuotaReading } from './egp/client';
import { testEnv } from '../testing/env';
import { contractSyncYears } from './egp/dates';
import type { EGPContractSubmitRecord } from './egp/contract-client';
import {
  ContractsService,
  parseSubmitPrice,
  type ContractSyncClient,
} from './contracts.service';

/** The harness clock is 2026-11-16, which is fiscal year 2570. */
const CONTRACT_SYNC_YEARS = contractSyncYears(new Date('2026-11-16T10:00:00.000Z'));

const logger = { warn: () => {} } as unknown as FastifyBaseLogger;

const contractRow = {
  project_id: 'project-1',
  project_name: 'Project 1',
  contract: [
    {
      contract_no: 'CN-1',
      winner_name: 'Winner',
      winner_tin: 'TIN-1',
      price_agree: 100_000,
    },
  ],
};

function harness(
  client: ContractSyncClient,
  options: {
    pause?: (ms: number) => Promise<void>;
    contractPublishError?: Error;
    submissionPublishError?: Error;
    cooldownState?: { until: string | null };
    logger?: FastifyBaseLogger;
  } = {},
) {
  const active = new Map<number, string>();
  const staged = new Map<number, Map<string, Contract[]>>();
  const submissionSnapshots = new Map<string, ContractSubmission[]>();
  const stagedSubmissions = new Map<string, ContractSubmission[]>();
  const discardedContracts: string[] = [];
  const discardedSubmissions: string[] = [];
  const completedSyncs = new Set<number>();
  const completedEnrichments = new Set<string>();
  const syncFailures = new Map<number, string>();
  const syncRetryAts = new Map<number, string>();
  const syncCalls: number[] = [];
  const enrichmentCalls: string[] = [];
  const cooldownState = options.cooldownState ?? { until: null };
  const cooldown: GovSpendingCooldownStore = {
    getCooldownUntil: async () => cooldownState.until,
    extendCooldown: async (until) => {
      if (cooldownState.until === null || until > cooldownState.until) {
        cooldownState.until = until;
      }
    },
  };
  let renewals = 0;

  const contracts: ContractStore = {
    listByProject: async (projectId, year) => {
      const results: Contract[] = [];
      for (const [contractYear, generation] of active) {
        if (year !== undefined && year !== contractYear) continue;
        results.push(
          ...(staged.get(contractYear)?.get(generation) ?? []).filter(
            (record) => record.projectId === projectId,
          ),
        );
      }
      return results;
    },
    listByYear: async (year) => {
      const generation = active.get(year);
      return generation ? (staged.get(year)?.get(generation) ?? []) : [];
    },
    replaceProjectSnapshot: async () => {},
    stageYearSnapshot: async (year, generation, rows) => {
      const generations = staged.get(year) ?? new Map<string, Contract[]>();
      generations.set(generation, rows);
      staged.set(year, generations);
    },
    discardStagedYearSnapshot: async (year, generation) => {
      discardedContracts.push(`${year}:${generation}`);
      staged.get(year)?.delete(generation);
    },
  };
  const submissions: ContractSubmissionStore = {
    listByProject: async (projectId, year) =>
      submissionSnapshots.get(`${projectId}:${year}`) ??
      (year === undefined
        ? [...submissionSnapshots.entries()]
            .filter(([key]) => key.startsWith(`${projectId}:`))
            .flatMap(([, rows]) => rows)
        : []),
    replaceProjectSnapshot: async () => {},
    stageProjectSnapshot: async (projectId, year, generation, rows) => {
      stagedSubmissions.set(`${projectId}:${year}:${generation}`, rows);
    },
    discardStagedProjectSnapshot: async (projectId, year, generation) => {
      discardedSubmissions.push(`${projectId}:${year}:${generation}`);
      stagedSubmissions.delete(`${projectId}:${year}:${generation}`);
    },
  };
  const syncs: ContractSyncStore = {
    claim: async (year) => {
      syncCalls.push(year);
      return completedSyncs.has(year) ? null : `sync-${year}`;
    },
    renew: async () => {
      renewals += 1;
      return true;
    },
    markCompleted: async (year, _token, _at, generation) => {
      completedSyncs.add(year);
      if (generation) active.set(year, generation);
      if (options.contractPublishError) throw options.contractPublishError;
    },
    markFailed: async (year, _token, failure) => {
      syncFailures.set(year, failure.error);
      syncRetryAts.set(year, failure.retryAt);
    },
  };
  const enrichment: ContractEnrichmentStore = {
    claim: async (projectId, year) => {
      const key = `${projectId}:${year}`;
      enrichmentCalls.push(key);
      return completedEnrichments.has(key) ? null : `enrichment-${key}`;
    },
    renew: async () => {
      renewals += 1;
      return true;
    },
    markCompleted: async (projectId, year, _source, _token, _at, generation) => {
      completedEnrichments.add(`${projectId}:${year}`);
      if (generation) {
        const key = `${projectId}:${year}:${generation}`;
        submissionSnapshots.set(`${projectId}:${year}`, stagedSubmissions.get(key) ?? []);
      }
      if (options.submissionPublishError) throw options.submissionPublishError;
    },
    markFailed: async () => {},
  };

  return {
    service: new ContractsService(
      contracts,
      submissions,
      syncs,
      enrichment,
      testEnv(),
      options.logger ?? logger,
      cooldown,
      {
        client,
        now: () => new Date('2026-11-16T10:00:00.000Z'),
        pause: options.pause ?? (async () => {}),
      },
    ),
    active,
    completedSyncs,
    completedEnrichments,
    syncFailures,
    syncRetryAts,
    syncCalls,
    enrichmentCalls,
    submissionSnapshots,
    staged,
    stagedSubmissions,
    discardedContracts,
    discardedSubmissions,
    cooldownState,
    get renewals() {
      return renewals;
    },
  };
}

describe('ContractsService annual sync', () => {
  test('syncs fiscal years and enriches submissions by project and year', async () => {
    const calls: string[] = [];
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage) => {
        calls.push(`contracts:${year}`);
        await beforePage?.(0);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (projectId, year, _env, beforePage) => {
        calls.push(`submissions:${projectId}:${year}`);
        await beforePage?.(0);
        return [
          {
            seq_no: 1,
            seq_no_desc: 'Item 1',
            bidder: [{ merchant_name: 'Bidder', submit_price: '90000.00' }],
          },
        ];
      },
    };
    const state = harness(fixture);

    await state.service.syncAnnual();

    expect(state.syncCalls).toEqual([...CONTRACT_SYNC_YEARS]);
    expect(state.completedSyncs.size).toBe(5);
    expect(state.active.has(2566)).toBe(true);
    expect(state.enrichmentCalls).toEqual(['project-1:2566']);
    expect(state.completedEnrichments.has('project-1:2566')).toBe(true);
    expect(state.submissionSnapshots.get('project-1:2566')).toEqual([
      {
        projectId: 'project-1',
        contractYear: 2566,
        merchantName: 'Bidder',
        seqNo: 1,
        seqNoDesc: 'Item 1',
        submitPrice: 90_000,
      },
    ]);
    expect(calls).toContain('submissions:project-1:2566');
    expect(state.renewals).toBe(12);
  });

  test('records an annual sync failure without publishing a staged generation', async () => {
    const fixture: ContractSyncClient = {
      getAllContracts: async () => {
        throw new Error('upstream unavailable');
      },
      getAllContractSubmissions: async () => [],
    };
    const state = harness(fixture);

    await expect(state.service.syncAnnual()).rejects.toThrow('upstream unavailable');
    expect(state.active.has(2566)).toBe(false);
    expect(state.syncFailures.get(2566)).toBe('upstream unavailable');
  });

  test('keeps a contract generation when publication may have committed before an error', async () => {
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage) => {
        await beforePage?.(0);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async () => [],
    };
    const state = harness(fixture, {
      contractPublishError: new Error('publish acknowledgement lost'),
    });

    await expect(state.service.syncAnnual()).rejects.toThrow('publish acknowledgement lost');

    const activeGeneration = state.active.get(2566);
    expect(activeGeneration).toBeString();
    expect(state.staged.get(2566)?.has(activeGeneration!)).toBe(true);
    expect(state.discardedContracts).toEqual([]);
  });

  test('keeps a submission generation when publication may have committed before an error', async () => {
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage) => {
        await beforePage?.(0);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (_projectId, _year, _env, beforePage) => {
        await beforePage?.(0);
        return [
          {
            seq_no: 1,
            seq_no_desc: 'Item 1',
            bidder: [{ merchant_name: 'Bidder', submit_price: '90000.00' }],
          },
        ];
      },
    };
    const state = harness(fixture, {
      submissionPublishError: new Error('publish acknowledgement lost'),
    });

    await state.service.syncAnnual();

    expect(state.completedEnrichments.has('project-1:2566')).toBe(true);
    expect(state.stagedSubmissions.size).toBe(1);
    expect(state.discardedSubmissions).toEqual([]);
  });

  test('shares quota state across years and pauses between independent API tasks', async () => {
    const calls: string[] = [];
    const pauses: number[] = [];
    const budgets: OpenDataQuotaBudget[] = [];
    const quota: QuotaReading = { limitDay: 100, remainingDay: 10 };
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage, onQuota, budget) => {
        await beforePage?.(0);
        if (budget) {
          budgets.push(budget);
          budget.reserveAttempt();
        }
        calls.push(`contracts:${year}`);
        onQuota?.(quota);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (projectId, year, _env, beforePage, onQuota, budget) => {
        await beforePage?.(0);
        if (budget) {
          budgets.push(budget);
          budget.reserveAttempt();
        }
        calls.push(`submissions:${projectId}:${year}`);
        onQuota?.(quota);
        return [];
      },
    };
    const state = harness(fixture, { pause: async (ms) => void pauses.push(ms) });

    await state.service.syncAnnual();

    expect(calls).toEqual([
      'contracts:2566',
      'submissions:project-1:2566',
      ...CONTRACT_SYNC_YEARS.slice(1).map((year) => `contracts:${year}`),
    ]);
    expect(pauses).toEqual(Array(CONTRACT_SYNC_YEARS.length).fill(400));
    expect(new Set(budgets).size).toBe(1);
  });

  test('does not start another API task after a response exhausts the quota', async () => {
    const calls: number[] = [];
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage, onQuota) => {
        await beforePage?.(0);
        calls.push(year);
        onQuota?.({ limitDay: 100, remainingDay: 0 });
        return [];
      },
      getAllContractSubmissions: async () => [],
    };
    const state = harness(fixture);

    await state.service.syncAnnual();

    expect(calls).toEqual([2566]);
    expect(state.syncCalls).toEqual([2566]);
    expect(state.cooldownState.until).toBe('2026-11-17T10:00:00.000Z');
  });

  test('does not start annual sync or submission enrichment during an active cooldown', async () => {
    const calls: string[] = [];
    const fixture: ContractSyncClient = {
      getAllContracts: async (year) => {
        calls.push(`contracts:${year}`);
        return [contractRow];
      },
      getAllContractSubmissions: async (projectId, year) => {
        calls.push(`submissions:${projectId}:${year}`);
        return [];
      },
    };
    const state = harness(fixture, {
      cooldownState: { until: '2026-11-17T10:00:00.000Z' },
    });

    await state.service.syncAnnual();

    expect(calls).toEqual([]);
    expect(state.syncCalls).toEqual([]);
    expect(state.enrichmentCalls).toEqual([]);
  });

  test('a cooldown set during contract sync blocks subsequent submission enrichment', async () => {
    const calls: string[] = [];
    const cooldownState = { until: null as string | null };
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage) => {
        await beforePage?.(0);
        calls.push(`contracts:${year}`);
        cooldownState.until = '2026-11-17T10:00:00.000Z';
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (projectId, year) => {
        calls.push(`submissions:${projectId}:${year}`);
        return [];
      },
    };
    const state = harness(fixture, { cooldownState });

    await state.service.syncAnnual();

    expect(calls).toEqual(['contracts:2566']);
    expect(state.enrichmentCalls).toEqual([]);
  });

  test('persists rate-limit cooldown across service instances', async () => {
    const cooldownState = { until: null as string | null };
    const rateLimited: ContractSyncClient = {
      getAllContracts: async () => {
        throw new RateLimitedError('https://example.test/contracts', 429);
      },
      getAllContractSubmissions: async () => [],
    };
    const { service: firstService, syncCalls, syncFailures } = harness(
      rateLimited,
      { cooldownState },
    );

    // One year's rate-limit error does not abort the annual sync:
    // the year is marked failed and the run completes without throwing.
    await expect(firstService.syncAnnual()).resolves.toBeUndefined();
    expect(cooldownState.until).toBe('2026-11-17T10:00:00.000Z');
    expect(syncCalls).toEqual([2566]);
    expect(syncFailures.get(2566)).toContain('rate limited');

    const calls: number[] = [];
    const restarted: ContractSyncClient = {
      getAllContracts: async (year) => {
        calls.push(year);
        return [];
      },
      getAllContractSubmissions: async () => [],
    };
    const second = harness(restarted, { cooldownState });
    await second.service.syncAnnual();
    expect(calls).toEqual([]);
  });

  test('quota exhaustion on one year does not abort other years', async () => {
    const cooldownState = { until: null as string | null };
    const calls: number[] = [];
    const fixture: ContractSyncClient = {
      getAllContracts: async (year) => {
        calls.push(year);
        if (year === 2566) throw new OpenDataQuotaExhaustedError();
        return [contractRow];
      },
      getAllContractSubmissions: async () => [],
    };
    const { service, syncCalls, syncFailures, cooldownState: cs } = harness(
      fixture,
      { cooldownState },
    );

    // syncAnnual completes without throwing even though year 2566 exhausted quota.
    await expect(service.syncAnnual()).resolves.toBeUndefined();

    // Year 2566 was attempted; subsequent years were blocked by the cooldown
    // that persistCooldown set after the exhaustion.
    expect(syncCalls).toEqual([2566]);
    expect(cs.until).toBeTruthy();
    expect(syncFailures.get(2566)).toContain('exhausted');
  });

  test('non-quota errors from syncYear still propagate out of syncAnnual', async () => {
    const fixture: ContractSyncClient = {
      getAllContracts: async () => {
        throw new Error('upstream unavailable');
      },
      getAllContractSubmissions: async () => [],
    };
    const { service } = harness(fixture);

    await expect(service.syncAnnual()).rejects.toThrow('upstream unavailable');
  });

  test('submission quota exhaustion on one project does not abort syncAnnual', async () => {
    const cooldownState = { until: null as string | null };
    const calls: string[] = [];
    const fixture: ContractSyncClient = {
      getAllContracts: async (year) => {
        calls.push(`contracts:${year}`);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (projectId, year) => {
        calls.push(`submissions:${projectId}:${year}`);
        if (projectId === 'project-1') throw new OpenDataQuotaExhaustedError();
        return [];
      },
    };
    const { service, enrichmentCalls, cooldownState: cs } = harness(
      fixture,
      { cooldownState },
    );

    // syncAnnual completes without throwing even though project-1's submissions exhausted quota.
    await expect(service.syncAnnual()).resolves.toBeUndefined();

    // project-1's submission enrichment was attempted.
    expect(enrichmentCalls).toEqual(['project-1:2566']);
    expect(cs.until).toBeTruthy();
  });
});

describe('parseSubmitPrice', () => {
  test('reads the numeric string the API sends', () => {
    expect(parseSubmitPrice('3000000.00')).toBe(3_000_000);
    expect(parseSubmitPrice(' 2995000 ')).toBe(2_995_000);
    expect(parseSubmitPrice(1250.5)).toBe(1250.5);
  });

  test('is null, never 0, for anything it cannot read', () => {
    for (const value of ['', '  ', 'abc', '-5', '1,000', '1e3', NaN, Infinity, -1, null, undefined, {}]) {
      expect(parseSubmitPrice(value)).toBeNull();
    }
  });
});

describe('ContractsService submission mapping', () => {
  test('keeps the line item on every bid and never invents a price', async () => {
    const fixture: ContractSyncClient = {
      getAllContracts: async (year, _env, beforePage) => {
        await beforePage?.(0);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (_projectId, _year, _env, beforePage) => {
        await beforePage?.(0);
        // Fixture in the shape the real API returns: the line item is on the record.
        return [
          {
            seq_no: 1,
            seq_no_desc: 'Item A',
            bidder: [
              { merchant_name: 'Bidder X', submit_price: '100.50' },
              { merchant_name: 'Bidder Y', submit_price: '' },
            ],
          },
          {
            seq_no: 2,
            seq_no_desc: 'Item B',
            bidder: [{ merchant_name: 'Bidder X', submit_price: 'not a number' }],
          },
        ];
      },
    };
    const state = harness(fixture);

    await state.service.syncAnnual();

    expect(state.submissionSnapshots.get('project-1:2566')).toEqual([
      { projectId: 'project-1', contractYear: 2566, merchantName: 'Bidder X', seqNo: 1, seqNoDesc: 'Item A', submitPrice: 100.5 },
      { projectId: 'project-1', contractYear: 2566, merchantName: 'Bidder Y', seqNo: 1, seqNoDesc: 'Item A', submitPrice: null },
      { projectId: 'project-1', contractYear: 2566, merchantName: 'Bidder X', seqNo: 2, seqNoDesc: 'Item B', submitPrice: null },
    ]);
  });
});

describe('ContractsService submission mapping: unreadable values', () => {
  function clientReturning(rows: EGPContractSubmitRecord[]): ContractSyncClient {
    return {
      getAllContracts: async (year, _env, beforePage) => {
        await beforePage?.(0);
        return year === 2566 ? [contractRow] : [];
      },
      getAllContractSubmissions: async (_projectId, _year, _env, beforePage) => {
        await beforePage?.(0);
        return rows;
      },
    };
  }

  test.each([
    ['0', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['a string', '2'],
    ['null', null],
    ['missing', undefined],
  ])('a line item number that is %s is stored as null, not repaired', async (_label, seqNo) => {
    const state = harness(
      clientReturning([
        {
          seq_no: seqNo as unknown as number,
          seq_no_desc: 'Item',
          bidder: [{ merchant_name: 'Bidder', submit_price: '10.00' }],
        },
      ]),
    );

    await state.service.syncAnnual();

    const [bid] = state.submissionSnapshots.get('project-1:2566') ?? [];
    expect(bid?.seqNo).toBeNull();
    expect(bid?.seqNoDesc).toBe('Item');
    expect(bid?.submitPrice).toBe(10);
  });

  test('warns with a count, and never the value, when a sent price cannot be read', async () => {
    const warnings: unknown[][] = [];
    const warnLogger = { warn: (...args: unknown[]) => warnings.push(args) } as unknown as FastifyBaseLogger;
    const state = harness(
      clientReturning([
        {
          seq_no: 1,
          seq_no_desc: 'Item',
          bidder: [
            { merchant_name: 'A', submit_price: '1,234.00' },
            { merchant_name: 'B', submit_price: 'secret-looking-text' },
            { merchant_name: 'C', submit_price: '' },
            { merchant_name: 'D', submit_price: null },
            { merchant_name: 'E', submit_price: '99.00' },
          ],
        },
      ]),
      { logger: warnLogger },
    );

    await state.service.syncAnnual();

    const unreadable = warnings.filter(([fields]) => (fields as { unreadablePrices?: number }).unreadablePrices);
    expect(unreadable).toHaveLength(1);
    expect(unreadable[0]![0]).toEqual({ projectId: 'project-1', contractYear: 2566, unreadablePrices: 2 });
    expect(JSON.stringify(warnings)).not.toContain('1,234');
    expect(JSON.stringify(warnings)).not.toContain('secret-looking-text');
    expect(state.submissionSnapshots.get('project-1:2566')?.map((bid) => bid.submitPrice)).toEqual([
      null,
      null,
      null,
      null,
      99,
    ]);
  });

  test('stays quiet when every price is readable or simply absent', async () => {
    const warnings: unknown[][] = [];
    const warnLogger = { warn: (...args: unknown[]) => warnings.push(args) } as unknown as FastifyBaseLogger;
    const state = harness(
      clientReturning([
        {
          seq_no: 1,
          seq_no_desc: 'Item',
          bidder: [
            { merchant_name: 'A', submit_price: '5.00' },
            { merchant_name: 'B', submit_price: null },
            { merchant_name: 'C', submit_price: ' ' },
          ],
        },
      ]),
      { logger: warnLogger },
    );

    await state.service.syncAnnual();

    expect(warnings.filter(([fields]) => (fields as { unreadablePrices?: number }).unreadablePrices)).toEqual([]);
  });
});
