import type { IngestionFailure, IngestionRecord } from '@torfun/types';
import { classifyProject, softwareScore } from './classify';
import { openDataGet, sleep } from './client';
import {
  CONTRACT_URL,
  DEPT_URL,
  E_BIDDING_METHOD,
  FISCAL_YEARS,
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

interface ContractRow {
  project_id?: string;
  project_name?: string;
  dept_name?: string;
  dept_sub_name?: string;
  year?: number;
  announce_date?: string;
  project_type_name?: string;
  purchase_method_name?: string;
  project_money?: number;
  project_status?: string;
}

export interface DeptResolution {
  registryName: string;
  candidatesReturned: number;
  matchedCodes: Array<{ deptCode: string; deptName: string }>;
  status: 'resolved' | 'ambiguous' | 'unresolved';
}

export interface DiscoveryResult {
  records: IngestionRecord[];
  /**
   * Records fetched under a registry dept_code whose own dept_name did not
   * match. Kept rather than dropped so the over-collection is auditable.
   */
  rejected: Array<{ projectId: string; projectName: string; deptName: string }>;
  resolutions: DeptResolution[];
  failures: IngestionFailure[];
  ranAt: string;
}

function now(): string {
  return new Date().toISOString();
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
): Promise<DeptResolution> {
  const { rows } = await openDataGet<DeptRow>(DEPT_URL, { dept_name: registryName }, apiKey);

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
    await sleep(POLITENESS.openDataDelayMs);

    total = page.total;
    records.push(...page.rows);

    // Defensive: a wrong `total` upstream must not spin this forever.
    if (page.rows.length === 0) break;
    offset += page.rows.length;
  }

  return records;
}

function toRecord(
  row: ContractRow,
  registryName: string,
  deptCode: string,
  year: number,
  keyword: string,
): IngestionRecord {
  const timestamp = now();
  const projectName = row.project_name ?? '';

  return {
    projectId: String(row.project_id),
    projectName,
    deptName: (row.dept_name ?? '').trim(),
    deptSubName: row.dept_sub_name ?? null,
    registryName,
    deptCode,
    year: row.year ?? year,
    announceDate: row.announce_date ?? null,
    projectTypeName: row.project_type_name ?? null,
    purchaseMethodName: row.purchase_method_name ?? null,
    projectMoney: row.project_money ?? null,
    projectStatus: row.project_status ?? null,
    matchedKeywords: [keyword],

    softwareClass: classifyProject(projectName),
    softwareScore: softwareScore(projectName),
    eBidding: row.purchase_method_name === E_BIDDING_METHOD,

    state: 'Queued',
    outcome: 'queued',
    statusHistory: [{ state: 'Queued', outcome: 'queued', at: timestamp }],

    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    torFiles: [],
    error: null,

    discoveredAt: timestamp,
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
export async function discoverProjects(apiKey: string): Promise<DiscoveryResult> {
  const failures: IngestionFailure[] = [];
  const resolutions: DeptResolution[] = [];
  const byProjectId = new Map<string, IngestionRecord>();
  const rejected = new Map<string, { projectId: string; projectName: string; deptName: string }>();

  for (const registryName of SOURCE_REGISTRY) {
    try {
      resolutions.push(await resolveDeptCodes(registryName, apiKey));
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
        error: error instanceof Error ? error.message : String(error),
        at: now(),
      });
    }
    await sleep(POLITENESS.openDataDelayMs);
  }

  for (const resolution of resolutions) {
    const deptCodes = [...new Set(resolution.matchedCodes.map((match) => match.deptCode))].sort();

    for (const deptCode of deptCodes) {
      // The names this dept_code is allowed to answer with.
      const expectedNames = new Set(
        resolution.matchedCodes
          .filter((match) => match.deptCode === deptCode)
          .map((match) => match.deptName.trim()),
      );

      for (const year of FISCAL_YEARS) {
        for (const keyword of SOFTWARE_KEYWORDS) {
          let rows: ContractRow[];
          try {
            rows = await fetchAllPages(deptCode, keyword, year, apiKey);
          } catch (error) {
            failures.push({
              projectId: '-',
              projectName: `${resolution.registryName} / ${keyword} / ${year}`,
              stage: 'discovery',
              error: error instanceof Error ? error.message : String(error),
              at: now(),
            });
            continue;
          }

          for (const row of rows) {
            const projectId = row.project_id ? String(row.project_id) : '';
            if (!projectId) continue;

            const rowDeptName = (row.dept_name ?? '').trim();
            if (!expectedNames.has(rowDeptName)) {
              rejected.set(projectId, {
                projectId,
                projectName: row.project_name ?? '',
                deptName: rowDeptName,
              });
              continue;
            }

            // Deduplicate by project id, the key the requirements name. A
            // project matching several keywords keeps all of them.
            const existing = byProjectId.get(projectId);
            if (existing) {
              if (!existing.matchedKeywords.includes(keyword)) {
                existing.matchedKeywords.push(keyword);
              }
            } else {
              byProjectId.set(
                projectId,
                toRecord(row, resolution.registryName, deptCode, year, keyword),
              );
            }
          }
        }
      }
    }
  }

  return {
    records: [...byProjectId.values()],
    rejected: [...rejected.values()],
    resolutions,
    failures,
    ranAt: now(),
  };
}
