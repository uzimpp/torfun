import type { AnnouncementClient, ProjectDetail } from '../services/egp/announcement-client';
import type { AnnouncementRow } from '../services/egp/milestones';

/** What the fake answers for a project detail no test asked about. */
export const SAMPLE_DETAIL: ProjectDetail = {
  budgetYear: 2569,
  typeId: '03',
  goodsId: '4016',
  deptSubName: 'สำนักเทคโนโลยีสารสนเทศ',
};

/**
 * An `AnnouncementClient` that answers from a table, so a pipeline test never
 * reaches the site. A project not in the table gets `otherwise`: unavailable
 * (null) unless the test says it has an empty timeline. Its detail is
 * `SAMPLE_DETAIL` unless `details` says otherwise. `calls` and `detailCalls`
 * record who was asked.
 */
export function fakeAnnouncements(
  timelines: Record<string, AnnouncementRow[] | null> = {},
  otherwise: AnnouncementRow[] | null = null,
  details: Record<string, ProjectDetail | null> = {},
): AnnouncementClient & { calls: string[]; detailCalls: string[] } {
  const calls: string[] = [];
  const detailCalls: string[] = [];
  return {
    calls,
    detailCalls,
    async timeline(projectId) {
      calls.push(projectId);
      const own = timelines[projectId];
      return own === undefined ? otherwise : own;
    },
    async projectDetail(projectId) {
      detailCalls.push(projectId);
      const own = details[projectId];
      return own === undefined ? SAMPLE_DETAIL : own;
    },
  };
}
