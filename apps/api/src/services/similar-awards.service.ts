import {
  closestAwardDigests,
  competitionLevel,
  digestAward,
  SIMILAR_AWARDS_MAX_BIDDER_CALLS,
  SIMILAR_AWARDS_MAX_SEARCHES,
  summariseAward,
  type AwardDigest,
  type CompetitionProject,
  type Contract,
  type ContractSubmission,
  type Procurement,
  type SimilarAwardListed,
  type SimilarAwards,
} from '@torfun/types';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/env';
import type { GovSpendingCooldownStore } from '../repositories/govspending-cooldown.repository';
import { isVisibleTo, type Audience } from './audience';
import { contractRecords, submissionRecords } from './contracts.service';
import {
  OpenDataForbiddenError,
  OpenDataQuotaBudget,
  OpenDataQuotaExhaustedError,
  RateLimitedError,
  sleep,
} from './egp/client';
import {
  fetchProjectSubmissionsOnce,
  searchContractsByKeyword,
  type EGPContractRecord,
  type EGPContractSubmitRecord,
  type KeywordSearchResult,
} from './egp/contract-client';
import { E_BIDDING_METHOD, POLITENESS } from './egp/constants';
import { convertDateToISO, currentFiscalYear } from './egp/dates';
import { buildSimilarKeyword } from './egp/similar-keyword';
import type { TorService } from './tor.service';

/**
 * Similar past awards found in open data by a name keyword (#144; provisional, accepted
 * for the course MVP only, and tried on two projects). A row found this way is found by
 * NAME. Nothing in this service says it is the same kind of work, and the same-agency and
 * e-bidding filters only cut unrelated rows.
 *
 * What one request does, at most: up to `SIMILAR_AWARDS_MAX_SEARCHES` keyword searches
 * (the current fiscal year and the two before it, one request each, no paging, no
 * retry), then up to `SIMILAR_AWARDS_MAX_BIDDER_CALLS` bidder lookups for the closest
 * projects (one per project and contract year, by the found row's own id and year).
 * It stops at the first refusal or error and sets the same 24-hour cooldown the contract
 * sync sets, and it makes no request at all while that cooldown lasts.
 *
 * Results are kept in this server's memory for `SIMILAR_AWARDS_CACHE_MS`, best effort:
 * they are not stored, are lost on restart, and an incomplete search is never kept, so
 * trying again asks again. Whether this is the right quota and cache policy is an open
 * implementation decision.
 */

export const SIMILAR_AWARDS_CACHE_MS = 24 * 60 * 60_000;

const COOLDOWN_MS = 24 * 60 * 60_000;

/** The two calls this service makes to open data; injected so a test never reaches the network. */
export interface SimilarAwardsClient {
  search(
    keyword: string,
    year: number,
    env: Env,
    quota: OpenDataQuotaBudget,
  ): Promise<KeywordSearchResult>;
  submissions(
    projectId: string,
    year: number,
    env: Env,
    quota: OpenDataQuotaBudget,
  ): Promise<{ rows: EGPContractSubmitRecord[]; truncated: boolean }>;
}

export const openDataSimilarAwardsClient: SimilarAwardsClient = {
  search: (keyword, year, env, quota) => searchContractsByKeyword(keyword, year, env, quota),
  submissions: (projectId, year, env, quota) =>
    fetchProjectSubmissionsOnce(projectId, year, env, quota),
};

/** The fiscal years searched: the current Thai fiscal year and the two before it, oldest first. */
export function similarAwardsYears(now: Date): number[] {
  const current = currentFiscalYear(now);
  return [current - 2, current - 1, current].slice(-SIMILAR_AWARDS_MAX_SEARCHES);
}

interface Found {
  row: EGPContractRecord;
  year: number;
}

interface Kept {
  project: CompetitionProject;
  contracts: Contract[];
  years: number[];
}

const noExclusions = (): SimilarAwards['excluded'] => ({
  ownProject: 0,
  otherAgency: 0,
  notEBidding: 0,
  noContractLines: 0,
  torUndated: 0,
  undated: 0,
  notEarlier: 0,
  malformed: 0,
  duplicates: 0,
});

function emptyResult(overrides: Partial<SimilarAwards>): SimilarAwards {
  return {
    status: 'ok',
    keyword: null,
    keywordSkipped: null,
    cooldownUntil: null,
    ownBudget: null,
    searches: [],
    rowsRead: 0,
    excluded: noExclusions(),
    projects: 0,
    closestCount: 0,
    withoutBudget: 0,
    listed: [],
    bidderCalls: { used: 0, max: SIMILAR_AWARDS_MAX_BIDDER_CALLS },
    competition: null,
    complete: true,
    cached: false,
    fetchedAt: null,
    ...overrides,
  };
}

function isRefusal(error: unknown): boolean {
  return (
    error instanceof RateLimitedError ||
    error instanceof OpenDataForbiddenError ||
    error instanceof OpenDataQuotaExhaustedError
  );
}

export class SimilarAwardsService {
  private readonly cache = new Map<string, { at: number; result: SimilarAwards }>();
  private readonly inFlight = new Map<string, Promise<SimilarAwards>>();
  constructor(
    private readonly tors: Pick<TorService, 'get'>,
    private readonly env: Env,
    private readonly cooldown: GovSpendingCooldownStore,
    private readonly logger: FastifyBaseLogger,
    private readonly options: {
      now?: () => Date;
      pause?: (ms: number) => Promise<void>;
      client?: SimilarAwardsClient;
    } = {},
  ) {}

  private now(): Date {
    return (this.options.now ?? (() => new Date()))();
  }

  private client(): SimilarAwardsClient {
    return this.options.client ?? openDataSimilarAwardsClient;
  }

  /**
   * Similar past awards for a TOR the caller may open. Offered only for a TOR an officer
   * may see (an administrator opening a held one is told it is not offered). The same
   * TOR asked twice within the cache time, or at once, costs one search.
   */
  async find(projectId: string, audience: Audience): Promise<SimilarAwards> {
    const tor = await this.tors.get(projectId, audience);
    if (!isVisibleTo('officer', tor)) return emptyResult({ status: 'not_offered' });

    const built = buildSimilarKeyword(tor.projectName, tor.deptName);
    if (built.keyword === null) {
      return emptyResult({
        status: 'no_keyword',
        keywordSkipped: built.skipped,
        ownBudget: tor.projectMoney,
      });
    }

    const hit = this.cache.get(projectId);
    if (hit && this.now().getTime() - hit.at < SIMILAR_AWARDS_CACHE_MS) {
      return { ...hit.result, cached: true };
    }

    const cooldownUntil = await this.cooldown.getCooldownUntil();
    if (cooldownUntil !== null && cooldownUntil > this.now().toISOString()) {
      return emptyResult({
        status: 'cooling_down',
        keyword: built.keyword,
        cooldownUntil,
        ownBudget: tor.projectMoney,
        complete: false,
      });
    }

    const running = this.inFlight.get(projectId);
    if (running) return running;
    const search = this.search(tor, built.keyword).finally(() => this.inFlight.delete(projectId));
    this.inFlight.set(projectId, search);
    return search;
  }

  private async search(tor: Procurement, keyword: string): Promise<SimilarAwards> {
    const started = this.now();
    let stopped = false;
    // What the API says is left of the day, for this request only. The day's allowance is
    // remembered across requests by the cooldown the first empty answer or refusal writes.
    const quota = new OpenDataQuotaBudget();

    // 1. Keyword searches, one request each, stopping at the first failure.
    const searches: SimilarAwards['searches'] = [];
    const found: Found[] = [];
    const years = similarAwardsYears(started);
    for (const [index, year] of years.entries()) {
      if (stopped) {
        searches.push({ year, total: null, read: 0, truncated: false, outcome: 'not_asked' });
        continue;
      }
      if (index > 0) await (this.options.pause ?? sleep)(POLITENESS.openDataDelayMs);
      try {
        const result = await this.client().search(keyword, year, this.env, quota);
        searches.push({
          year,
          total: result.total,
          read: result.rows.length,
          truncated: result.truncated,
          outcome: 'read',
        });
        for (const row of result.rows) found.push({ row, year });
        if (quota.remainingDay === 0) stopped = await this.startCooldown(null);
      } catch (error) {
        searches.push({ year, total: null, read: 0, truncated: false, outcome: 'failed' });
        stopped = await this.startCooldown(error);
      }
    }

    // 2. Keep the rows that pass the filters, grouped by project.
    const excluded = noExclusions();
    const kept = this.keep(tor, found, excluded);

    // 3. The ten whose planned budget is nearest this TOR's, from what is known so far.
    const withoutBids = [...kept.values()].map((entry) =>
      digestAward(entry.project, summariseAward(entry.contracts, [])),
    );
    const closest = closestAwardDigests(tor.projectMoney, withoutBids);

    // 4. Bidders for those ten, within the request's limit; all a project's years or none.
    let used = 0;
    const listed: SimilarAwardListed[] = [];
    const digests: AwardDigest[] = [];
    for (const { digest, difference } of closest.listed) {
      const entry = kept.get(digest.project.projectId)!;
      const lookup = await this.lookUpBidders(entry, used, stopped, quota);
      used += lookup.calls;
      if (lookup.stopped) stopped = true;
      const withBids =
        lookup.bidders === 'read'
          ? digestAward(entry.project, summariseAward(entry.contracts, lookup.submissions))
          : digest;
      digests.push(withBids);
      listed.push(toListed(withBids, difference, entry.years, lookup.bidders));
    }

    const complete =
      !stopped &&
      searches.every((search) => search.outcome === 'read') &&
      listed.every((item) => item.bidders !== 'not_asked' && item.bidders !== 'failed');
    const result = emptyResult({
      keyword,
      ownBudget: tor.projectMoney,
      searches,
      rowsRead: found.length,
      excluded,
      projects: kept.size,
      closestCount: closest.count,
      withoutBudget: closest.withoutBudget,
      listed,
      bidderCalls: { used, max: SIMILAR_AWARDS_MAX_BIDDER_CALLS },
      competition: digests.length > 0 ? competitionLevel(digests) : null,
      complete,
      fetchedAt: started.toISOString(),
    });
    if (complete) this.cache.set(tor.projectId, { at: started.getTime(), result });
    return result;
  }

  /** The rows that pass the filters, one entry per project, its contract lines of every year found. */
  private keep(tor: Procurement, found: Found[], excluded: SimilarAwards['excluded']) {
    const torAnnounced = tor.announceDate === null ? Number.NaN : Date.parse(tor.announceDate);
    const kept = new Map<string, Kept>();
    const seen = new Set<string>();

    for (const { row, year } of [...found].sort((a, b) => b.year - a.year)) {
      if (!row.project_id || !Array.isArray(row.contract)) {
        excluded.malformed += 1;
        continue;
      }
      const key = `${row.project_id}|${year}`;
      if (seen.has(key)) {
        excluded.duplicates += 1;
        continue;
      }
      seen.add(key);

      if (row.project_id === tor.projectId) excluded.ownProject += 1;
      else if (row.dept_name !== tor.deptName) excluded.otherAgency += 1;
      else if (row.purchase_method_name !== E_BIDDING_METHOD) excluded.notEBidding += 1;
      else if (row.contract.length === 0) excluded.noContractLines += 1;
      else if (Number.isNaN(torAnnounced)) excluded.torUndated += 1;
      else {
        const announced = convertDateToISO(row.announce_date);
        if (announced === null) excluded.undated += 1;
        else if (Date.parse(announced) >= torAnnounced) excluded.notEarlier += 1;
        else {
          let contracts: Contract[];
          try {
            contracts = contractRecords([row], year);
          } catch {
            excluded.malformed += 1;
            continue;
          }
          const existing = kept.get(row.project_id);
          if (existing) {
            existing.contracts.push(...contracts);
            existing.years.push(year);
          } else {
            kept.set(row.project_id, {
              project: {
                projectId: row.project_id,
                projectName: row.project_name,
                deptName: row.dept_name ?? '',
                budget: contracts[0]?.projectMoney ?? null,
                // The open data's year is the contract year, never a budget year.
                budgetYear: null,
                announceDate: announced,
              },
              contracts,
              years: [year],
            });
          }
        }
      }
    }
    for (const entry of kept.values()) entry.years.sort((a, b) => a - b);
    return kept;
  }

  /**
   * One project's bidders: a lookup for each of its contract years or none, so a count is
   * never read from only some of its years. Not asked when the request's limit would be
   * passed, or a refusal or error has already stopped the request.
   */
  private async lookUpBidders(
    entry: Kept,
    used: number,
    stopped: boolean,
    quota: OpenDataQuotaBudget,
  ): Promise<{
    bidders: SimilarAwardListed['bidders'];
    calls: number;
    stopped: boolean;
    submissions: ContractSubmission[];
  }> {
    if (stopped || used + entry.years.length > SIMILAR_AWARDS_MAX_BIDDER_CALLS) {
      return { bidders: 'not_asked', calls: 0, stopped: false, submissions: [] };
    }

    const submissions: ContractSubmission[] = [];
    let calls = 0;
    let read = false;
    for (const year of [...entry.years].sort((a, b) => b - a)) {
      if (quota.remainingDay === 0) {
        return { bidders: 'failed', calls, stopped: true, submissions: [] };
      }
      await (this.options.pause ?? sleep)(POLITENESS.openDataDelayMs);
      calls += 1;
      try {
        const page = await this.client().submissions(
          entry.project.projectId,
          year,
          this.env,
          quota,
        );
        // A cut page is not the project's bidders: a count read from part of them is wrong.
        if (page.truncated) return { bidders: 'failed', calls, stopped: false, submissions: [] };
        if (page.rows.length > 0) read = true;
        submissions.push(...submissionRecords(page.rows, entry.project.projectId, year).records);
        if (quota.remainingDay === 0) await this.startCooldown(null);
      } catch (error) {
        await this.startCooldown(error);
        return { bidders: 'failed', calls, stopped: true, submissions: [] };
      }
    }
    return { bidders: read ? 'read' : 'none', calls, stopped: false, submissions };
  }

  /**
   * The same 24-hour stop the contract sync sets: after a refusal (429/403), an exhausted
   * quota (the API's own count reached 0) or any other failure, no further request is made.
   * A refusal or an empty day also writes the cooldown, so the next request makes none.
   */
  private async startCooldown(error: unknown): Promise<boolean> {
    if (error !== null && !isRefusal(error)) {
      this.logger.warn({ err: error }, 'similar awards: a request to open data failed');
      return true;
    }
    const at = this.now();
    await this.cooldown.extendCooldown(
      new Date(at.getTime() + COOLDOWN_MS).toISOString(),
      at.toISOString(),
    );
    this.logger.warn(
      'similar awards: open data refused or the day allowance is used; cooling down',
    );
    return true;
  }
}

function toListed(
  digest: AwardDigest,
  difference: number,
  years: number[],
  bidders: SimilarAwardListed['bidders'],
): SimilarAwardListed {
  return {
    projectId: digest.project.projectId,
    projectName: digest.project.projectName,
    deptName: digest.project.deptName,
    budget: digest.project.budget,
    announceDate: digest.project.announceDate,
    difference,
    contractYears: years,
    winnerStatus: digest.winnerStatus,
    winners: digest.winners,
    undeterminedAwards: digest.undeterminedAwards,
    bidderCount: digest.bidderCount,
    bidderCountGap: digest.bidderCountGap,
    clean: digest.clean,
    prices: digest.prices,
    bidders,
  };
}
