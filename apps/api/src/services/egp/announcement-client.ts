import { egpGet, UpstreamError } from './client';
import {
  BROWSER_HEADERS,
  GREEN_BOOK_URL,
  PROCUREMENT_DETAIL_URL,
  PROJECT_DETAIL_URL,
  TOR_ZIP_LIST_URL,
} from './constants';
import type { AnnouncementRow } from './milestones';

/**
 * The project's announcement timeline on e-GP: what has been published for it,
 * and when. Its code and date are all that is read, and the code is used once,
 * to set a milestone (`milestones.ts`).
 *
 * Reaching the site, this is called only from inside a SiteGate hold (see
 * `pipeline.ts`), like every other request to it.
 */
export interface AnnouncementClient {
  /**
   * The timeline's rows, empty where nothing is published yet. Null where e-GP
   * has none to give: the site answers `data: null` for that, and it must never
   * be read as "no announcements", which would pass for a project at no stage.
   */
  timeline(projectId: string, signal?: AbortSignal): Promise<AnnouncementRow[] | null>;
  /**
   * The project's detail: its budget year, e-GP's type and goods codes, and the
   * sub-agency. Null where e-GP gives no detail or no whole-number year, because
   * a year is the one thing a record cannot be stored without.
   */
  projectDetail(projectId: string, signal?: AbortSignal): Promise<ProjectDetail | null>;
  /**
   * The project's procurement detail: its Goods Category, Budget and Reference
   * Price, and what its draft list is asked with. Null on `data: null`.
   */
  procurementDetail(projectId: string, signal?: AbortSignal): Promise<ProcurementDetail | null>;
  /**
   * The last day for comments on the project's latest draft version, as e-GP
   * sends it (`17:00Z` is Bangkok midnight of the next day). Null where there is
   * no draft list or the latest version gives no date.
   */
  commentsCloseAt(
    projectId: string,
    params: DraftListParams,
    signal?: AbortSignal,
  ): Promise<string | null>;
}

export interface ProjectDetail {
  budgetYear: number;
  typeId: string | null;
  goodsId: string | null;
  deptSubName: string | null;
}

/** The parameters getTorZipList wants beside the project id, as getProcurementDetail gives them. */
export interface DraftListParams {
  methodId: string;
  projectVersion: string;
  typeProject: string;
  stepId: string;
  typeId: string;
}

export interface ProcurementDetail {
  goodsId: string | null;
  typeId: string | null;
  deptSubName: string | null;
  projectMoney: number | null;
  priceBuild: number | null;
  /** Null where any parameter is missing, so the draft list cannot be asked for. */
  draftListParams: DraftListParams | null;
}

/** The body as JSON, or an upstream failure naming what was asked for. */
async function readJson<T>(response: Response, what: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError(`Non-JSON response from the ${what}`);
  }
}

/** A year as e-GP writes it, `"2569"` or `2569`; null for anything not a whole number. */
function parseYear(value: unknown): number | null {
  const year = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return typeof year === 'number' && Number.isInteger(year) ? year : null;
}

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

function parseAmount(value: unknown): number | null {
  const amount =
    typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
}

function parseDraftListParams(data: Record<string, unknown>): DraftListParams | null {
  const methodId = textOrNull(data.methodId);
  const projectVersion = textOrNull(data.projectVersion);
  const typeProject = textOrNull(data.typeProject);
  const stepId = textOrNull(data.stepId);
  const typeId = textOrNull(data.typeId);
  if (!methodId || !projectVersion || !typeProject || !stepId || !typeId) return null;
  return { methodId, projectVersion, typeProject, stepId, typeId };
}

interface GreenBookResponse {
  data?: { greenBookAnnouncementTypeLinkDto?: unknown } | null;
}

interface ProjectDetailResponse {
  data?: {
    budgetYear?: unknown;
    typeId?: unknown;
    goodsId?: unknown;
    deptSubName?: unknown;
  } | null;
}

interface ProcurementDetailResponse {
  data?: Record<string, unknown> | null;
}

interface DraftVersionRow {
  commentFDate?: unknown;
  webDate?: unknown;
}

interface TorZipListResponse {
  data?: (DraftVersionRow | null)[] | null;
}

export function createAnnouncementClient(): AnnouncementClient {
  return {
    async timeline(projectId, signal) {
      const response = await egpGet(
        GREEN_BOOK_URL,
        // The site answers `data: null` without pageAnnounceType; its value is not used.
        { mode: 'LINK', methodId: 16, tempProjectId: projectId, pageAnnounceType: 'W0' },
        BROWSER_HEADERS,
        signal,
      );

      const body = await readJson<GreenBookResponse>(
        response,
        `timeline endpoint for ${projectId}`,
      );

      const rows = body.data?.greenBookAnnouncementTypeLinkDto;
      if (!Array.isArray(rows)) return null;
      return rows.flatMap((row: { announceType?: unknown; announceDate?: unknown }) =>
        typeof row?.announceType === 'string'
          ? [
              {
                announceType: row.announceType,
                announceDate: typeof row.announceDate === 'string' ? row.announceDate : null,
              },
            ]
          : [],
      );
    },

    async projectDetail(projectId, signal) {
      const response = await egpGet(
        PROJECT_DETAIL_URL,
        { projectId },
        BROWSER_HEADERS,
        signal,
        'lookup',
      );
      const { data } = await readJson<ProjectDetailResponse>(
        response,
        `project detail endpoint for ${projectId}`,
      );
      const budgetYear = parseYear(data?.budgetYear);
      if (!data || budgetYear === null) return null;
      return {
        budgetYear,
        typeId: textOrNull(data.typeId),
        goodsId: textOrNull(data.goodsId),
        deptSubName: textOrNull(data.deptSubName),
      };
    },

    async procurementDetail(projectId, signal) {
      const response = await egpGet(
        PROCUREMENT_DETAIL_URL,
        { projectId },
        BROWSER_HEADERS,
        signal,
        'lookup',
      );
      const { data } = await readJson<ProcurementDetailResponse>(
        response,
        `procurement detail endpoint for ${projectId}`,
      );
      if (!data) return null;
      return {
        goodsId: textOrNull(data.goodsId),
        typeId: textOrNull(data.typeId),
        deptSubName: textOrNull(data.deptSubName),
        projectMoney: parseAmount(data.projectMoney),
        priceBuild: parseAmount(data.priceBuild),
        draftListParams: parseDraftListParams(data),
      };
    },

    async commentsCloseAt(projectId, params, signal) {
      const response = await egpGet(
        TOR_ZIP_LIST_URL,
        { projectId, ...params },
        BROWSER_HEADERS,
        signal,
        'lookup',
      );
      const { data } = await readJson<TorZipListResponse>(
        response,
        `draft list endpoint for ${projectId}`,
      );
      if (!Array.isArray(data)) return null;
      const published = (row: DraftVersionRow | null) => textOrNull(row?.webDate) ?? '';
      const latest = data.reduce<DraftVersionRow | null | undefined>(
        (best, row) => (best === undefined || published(row) > published(best) ? row : best),
        undefined,
      );
      return textOrNull(latest?.commentFDate);
    },
  };
}
