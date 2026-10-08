import { egpGet, UpstreamError } from './client';
import { BROWSER_HEADERS, GREEN_BOOK_URL, PROJECT_DETAIL_URL } from './constants';
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
}

export interface ProjectDetail {
  budgetYear: number;
  typeId: string | null;
  goodsId: string | null;
  deptSubName: string | null;
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
      const response = await egpGet(PROJECT_DETAIL_URL, { projectId }, BROWSER_HEADERS, signal);
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
  };
}
