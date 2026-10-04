import { egpGet, UpstreamError } from './client';
import { BROWSER_HEADERS, GREEN_BOOK_URL } from './constants';
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
}

interface GreenBookResponse {
  data?: { greenBookAnnouncementTypeLinkDto?: unknown } | null;
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

      let body: GreenBookResponse;
      try {
        body = (await response.json()) as GreenBookResponse;
      } catch {
        throw new UpstreamError(`Non-JSON response from the timeline endpoint for ${projectId}`);
      }

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
  };
}
