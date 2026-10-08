import { EMPTY_MILESTONES } from '@torfun/types';
import type { IngestionFailure, OpenDataQuota, Procurement } from '@torfun/types';
import { admit } from './admission';
import {
  OpenDataForbiddenError,
  openDataGet,
  RateLimitedError,
  sleep,
  type QuotaReading,
} from './client';
import { convertDateToISO } from './dates';
import { toWinner } from './winner';
import {
  CONTRACT_URL,
  DEPT_URL,
  FISCAL_YEARS,
  OPEN_DATA_RESERVE,
  PAGE_LIMIT,
  POLITENESS,
  SOFTWARE_KEYWORDS,
  SOURCE_REGISTRY,
} from './constants';

/**
 * Stage 1 of the pipeline: scheduled retrieval from the EGP-CONTRACT open-data
 * API, filtered to the Source Registry, deduplicated by project id.
 *
 * Ported from the Python POC's fetch_egp_projects.py, since removed; see
 * docs/poc_fullflow/README.md for the reasoning behind each rule here.
 */

interface DeptRow {
  dept_code?: string;
  dept_name?: string;
}

export interface ContractRow {
  project_id?: string;
  project_name?: string;
  dept_name?: string;
  dept_sub_name?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  year?: number;
  announce_date?: string;
  project_type_name?: string;
  purchase_method_name?: string;
  project_money?: number;
  price_build?: number;
  contract?: unknown;
}

/** Which of these project ids have a tombstone. */
export type TombstoneLookup = (projectIds: string[]) => Promise<Set<string>>;

const NO_TOMBSTONES: ReadonlySet<string> = new Set();

export interface DeptResolution {
  registryName: string;
  candidatesReturned: number;
  matchedCodes: Array<{ deptCode: string; deptName: string }>;
  status: 'resolved' | 'ambiguous' | 'unresolved';
}

export interface DiscoveryResult {
  records: Procurement[];
  /**
   * Records fetched under a registry dept_code whose own dept_name did not
   * match. Kept rather than dropped so the over-collection is auditable.
   */
  rejected: Array<{ projectId: string; projectName: string; deptName: string }>;
  /**
   * Rows by any purchase method other than e-bidding. Counted and not stored:
   * the product is e-bidding tenders, so what a sweep keeps is limited to those.
   */
  notEBidding: number;
  /**
   * Registry e-bidding projects left out because they have a tombstone: the model
   * or an administrator already ruled them out. Counted, not stored.
   */
  tombstoned: number;
  resolutions: DeptResolution[];
  failures: IngestionFailure[];
  /**
   * The open-data API answered 429 (allowance spent) or 403 (blocked, or the key
   * refused) and the sweep stopped there. What was
   * found before that is kept; nothing further was asked for. The caller stops
   * the Run — a site saying stop is not something to work around.
   */
  rateLimited: boolean;
  /**
   * The sweep stopped because the day's allowance was down to its reserve, not
   * because it was refused. Partial, and not a fault.
   */
  budgetReached: boolean;
  /** The allowance as last reported during the sweep; null if no response said. */
  quota: OpenDataQuota | null;
  ranAt: string;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Watches the day's allowance as responses report it, so a sweep can stop with a
 * reserve in hand instead of finding out from a refusal.
 */
class QuotaGauge {
  private reading: QuotaReading | null = null;
  private observedAt: string | null = null;

  observe = (reading: QuotaReading): void => {
    if (reading.remainingDay === null) return;
    this.reading = reading;
    this.observedAt = now();
  };

  get reserveReached(): boolean {
    return this.reading !== null && (this.reading.remainingDay ?? Infinity) <= OPEN_DATA_RESERVE;
  }

  toQuota(): OpenDataQuota | null {
    if (this.reading === null || this.reading.remainingDay === null || this.observedAt === null) {
      return null;
    }
    return {
      remainingDay: this.reading.remainingDay,
      limitDay: this.reading.limitDay,
      observedAt: this.observedAt,
    };
  }
}

/**
 * Resolve a registry name to its dept_code(s).
 *
 * This doubles as the name-correctness check the requirements ask for: a name
 * that resolves to nothing is a typo or a renamed agency, and is reported as
 * `unresolved` rather than silently yielding zero projects.
 *
 * egp-dept matches by substring, so a raw query returns noise — querying
 * "กรุงเทพมหานคร" also returns every hospital and school with that substring
 * in its name. Only two forms are accepted as a match: the exact name, and the
 * name plus the public-organisation suffix (DGA registers itself as
 * "สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)" but nobody types that).
 */
export async function resolveDeptCodes(
  registryName: string,
  apiKey: string,
  onQuota?: (reading: QuotaReading) => void,
): Promise<DeptResolution> {
  const { rows, quota } = await openDataGet<DeptRow>(DEPT_URL, { dept_name: registryName }, apiKey);
  onQuota?.(quota);

  const exactWithSuffix = `${registryName} (องค์การมหาชน)`;
  const matchedCodes = rows
    .filter((row) => row.dept_name === registryName || row.dept_name === exactWithSuffix)
    .map((row) => ({ deptCode: row.dept_code ?? '', deptName: row.dept_name ?? '' }))
    .filter((match) => match.deptCode !== '');

  const distinctNames = new Set(matchedCodes.map((match) => match.deptName));

  return {
    registryName,
    candidatesReturned: rows.length,
    matchedCodes,
    // Several dept_codes sharing ONE name is expected, not ambiguous — DGA is
    // split across 0136 and 1108 by fiscal year, and both are queried. Two
    // different names both passing the match test is the genuinely ambiguous case.
    status:
      matchedCodes.length === 0 ? 'unresolved' : distinctNames.size > 1 ? 'ambiguous' : 'resolved',
  };
}

/** Page through egp-contract until every record for one combination is collected. */
async function fetchAllPages(
  deptCode: string,
  keyword: string,
  year: number,
  apiKey: string,
  onQuota: (reading: QuotaReading) => void,
  pause: (ms: number) => Promise<void>,
): Promise<ContractRow[]> {
  const records: ContractRow[] = [];
  let offset = 0;
  let total: number | null = null;

  while (total === null || offset < total) {
    const page = await openDataGet<ContractRow>(
      CONTRACT_URL,
      { dept_code: deptCode, keyword, year, offset, limit: PAGE_LIMIT },
      apiKey,
    );
    onQuota(page.quota);
    await pause(POLITENESS.openDataDelayMs);

    total = page.total;
    records.push(...page.rows);

    // Defensive: a wrong `total` upstream must not spin this forever.
    if (page.rows.length === 0) break;
    offset += page.rows.length;
  }

  return records;
}

/** Maps one raw e-GP contract row at the upstream boundary. Exported for fixture-based contract tests. */
export function toRecord(row: ContractRow, deptCode: string, year: number): Procurement {
  const timestamp = now();

  return {
    projectId: String(row.project_id),
    projectName: row.project_name ?? '',
    deptName: (row.dept_name ?? '').trim(),
    deptSubName: row.dept_sub_name ?? null,
    province: row.province?.trim() || null,
    district: row.district?.trim() || null,
    subdistrict: row.subdistrict?.trim() || null,
    deptCode,
    budgetYear: row.year ?? year,
    announceDate: convertDateToISO(row.announce_date),
    projectTypeName: row.project_type_name ?? null,
    purchaseMethodName: row.purchase_method_name ?? null,
    projectMoney: row.project_money ?? null,
    priceBuild: row.price_build ?? null,
    // The feed's one status value places a project in no stage; the timeline does.
    status: 'unknown',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,

    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [{ state: 'Queued', outcome: 'queued', at: timestamp }],

    zipId: null,
    documents: [],
    analysis: null,
    winner: toWinner(row.contract),
    torAmbiguous: false,

    discoveredAt: timestamp,
    sourceHash: null, // fingerprinted by the store as it writes
    updatedAt: timestamp,
  };
}

/**
 * Run the full discovery sweep: registry → dept_code → paged contract records.
 *
 * Every record is passed through a STRICT dept_name check on the way in. This
 * is not redundant with the dept_code filter: "กระทรวงดิจิทัลเพื่อเศรษฐกิจและ
 * สังคม" resolves to dept_code 11, which upstream is a MINISTRY-LEVEL
 * AGGREGATE. egp-contract accepts it and returns records for every subordinate
 * agency — ETDA, BDI, DEPA, DGA, the national statistics office — none of which
 * are in the registry. An unfiltered run had 124 of 214 records belonging to an
 * agency other than the one they were fetched under. Since dept_name cannot be
 * passed as a request filter, a post-fetch exact match is the only way to
 * enforce registry membership.
 */
export async function discoverProjects(
  apiKey: string,
  tombstonedIds: TombstoneLookup,
  // The politeness delay between open-data calls. Only a test replaces it.
  pause: (ms: number) => Promise<void> = sleep,
): Promise<DiscoveryResult> {
  const failures: IngestionFailure[] = [];
  const resolutions: DeptResolution[] = [];
  const byProjectId = new Map<string, Procurement>();
  const rejected = new Map<string, { projectId: string; projectName: string; deptName: string }>();
  const notEBidding = new Set<string>();
  const tombstoned = new Set<string>();

  let rateLimited = false;
  let budgetReached = false;
  const gauge = new QuotaGauge();

  for (const registryName of SOURCE_REGISTRY) {
    if (gauge.reserveReached) {
      budgetReached = true;
      break;
    }
    try {
      resolutions.push(await resolveDeptCodes(registryName, apiKey, gauge.observe));
    } catch (error) {
      resolutions.push({
        registryName,
        candidatesReturned: 0,
        matchedCodes: [],
        status: 'unresolved',
      });
      failures.push({
        projectId: '-',
        projectName: registryName,
        stage: 'dept',
        kind: 'fault',
        error: error instanceof Error ? error.message : String(error),
        at: now(),
      });
      if (error instanceof OpenDataForbiddenError) {
        // Blocked, not spent: the allowance is left as the last response said.
        rateLimited = true;
        break;
      }
      if (error instanceof RateLimitedError) {
        // Refused: whatever it said, nothing is left today.
        gauge.observe({ limitDay: error.quota?.limitDay ?? null, remainingDay: 0 });
        rateLimited = true;
        break;
      }
    }
    await pause(POLITENESS.openDataDelayMs);
  }

  sweep: for (const resolution of resolutions) {
    if (rateLimited || budgetReached) break;
    const deptCodes = [...new Set(resolution.matchedCodes.map((match) => match.deptCode))].sort();

    for (const deptCode of deptCodes) {
      // The names this dept_code is allowed to answer with.
      const expectedNames = new Set(
        resolution.matchedCodes
          .filter((match) => match.deptCode === deptCode)
          .map((match) => match.deptName.trim()),
      );

      // What this agency returned in total, and whether any of it failed to be
      // asked for. An agency that gave nothing under any keyword is more likely
      // renamed or re-coded than empty, so it is reported rather than taken as
      // having nothing — and nothing downstream may treat it as "gone".
      let rowsSeen = 0;
      let unitFailed = false;

      for (const year of FISCAL_YEARS) {
        for (const keyword of SOFTWARE_KEYWORDS) {
          if (gauge.reserveReached) {
            budgetReached = true;
            break sweep;
          }
          let rows: ContractRow[];
          try {
            rows = await fetchAllPages(deptCode, keyword, year, apiKey, gauge.observe, pause);
          } catch (error) {
            failures.push({
              projectId: '-',
              projectName: `${resolution.registryName} / ${keyword} / ${year}`,
              stage: 'discovery',
              kind: 'fault',
              error: error instanceof Error ? error.message : String(error),
              at: now(),
            });
            if (error instanceof OpenDataForbiddenError) {
              rateLimited = true;
              break sweep;
            }
            if (error instanceof RateLimitedError) {
              gauge.observe({ limitDay: error.quota?.limitDay ?? null, remainingDay: 0 });
              rateLimited = true;
              break sweep;
            }
            unitFailed = true;
            continue;
          }
          rowsSeen += rows.length;

          const toAdmissionRow = (row: ContractRow, projectId: string) => ({
            projectId,
            deptName: (row.dept_name ?? '').trim(),
            purchaseMethodName: row.purchase_method_name,
          });

          // Ask about tombstones only for what would otherwise be admitted: the
          // lookup is a database round trip, and most of a feed is turned away.
          const wanted = rows.flatMap((row) => {
            const projectId = row.project_id ? String(row.project_id) : '';
            return projectId &&
              admit(toAdmissionRow(row, projectId), expectedNames, NO_TOMBSTONES) === 'admit'
              ? [projectId]
              : [];
          });
          const ruledOut = wanted.length > 0 ? await tombstonedIds(wanted) : NO_TOMBSTONES;

          for (const row of rows) {
            const projectId = row.project_id ? String(row.project_id) : '';
            if (!projectId) continue;

            // Admission is the agency, the tender method and the tombstone. The
            // title is not consulted: whether the work is software is for the
            // document to say, once it is read.
            switch (admit(toAdmissionRow(row, projectId), expectedNames, ruledOut)) {
              case 'not_registry':
                rejected.set(projectId, {
                  projectId,
                  projectName: row.project_name ?? '',
                  deptName: (row.dept_name ?? '').trim(),
                });
                break;
              case 'not_e_bidding':
                notEBidding.add(projectId);
                break;
              case 'tombstoned':
                tombstoned.add(projectId);
                break;
              case 'admit':
                // Deduplicated by project id, the key the requirements name: the
                // same project turns up under several keywords and years.
                if (!byProjectId.has(projectId)) {
                  byProjectId.set(projectId, toRecord(row, deptCode, year));
                }
                break;
            }
          }
        }
      }

      if (rowsSeen === 0 && !unitFailed) {
        failures.push({
          projectId: '-',
          projectName: `${resolution.registryName} / ${deptCode}`,
          stage: 'discovery',
          kind: 'fault',
          error: `Agency code ${deptCode} (${resolution.registryName}) returned no rows under any keyword or year — treated as a failed unit, not as having nothing. It may have been renamed or re-coded.`,
          at: now(),
        });
      }
    }
  }

  return {
    records: [...byProjectId.values()],
    rejected: [...rejected.values()],
    notEBidding: notEBidding.size,
    tombstoned: tombstoned.size,
    resolutions,
    failures,
    rateLimited,
    budgetReached,
    quota: gauge.toQuota(),
    ranAt: now(),
  };
}
