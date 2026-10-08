import type { AnnouncementClient } from '../services/egp/announcement-client';
import type { AnnouncementRow } from '../services/egp/milestones';

/**
 * An `AnnouncementClient` that answers from a table, so a pipeline test never
 * reaches the site. A project not in the table gets `otherwise`: unavailable
 * (null) unless the test says it has an empty timeline. `calls` records who was asked.
 */
export function fakeAnnouncements(
  timelines: Record<string, AnnouncementRow[] | null> = {},
  otherwise: AnnouncementRow[] | null = null,
): AnnouncementClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async timeline(projectId) {
      calls.push(projectId);
      const own = timelines[projectId];
      return own === undefined ? otherwise : own;
    },
  };
}
