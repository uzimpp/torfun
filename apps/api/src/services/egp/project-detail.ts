import type { Procurement } from '@torfun/types';
import type { AnnouncementClient } from './announcement-client';
import { RateLimitedError } from './client';

/** What a project detail read sets on a record. */
export type DetailFields = Pick<
  Procurement,
  'budgetYear' | 'typeId' | 'goodsId' | 'deptSubName' | 'detailCheckedAt'
>;

/**
 * Read one project's detail from e-GP: the fields to set, or why there are none.
 * Used by Discovery for a project not yet stored and by record work for one
 * stored before the detail was read (ADR-0019).
 *
 * A refusal is thrown, not returned: it is the site saying stop, and the caller
 * that stops the Run has to see it. Call it inside a SiteGate hold.
 */
export async function readProjectDetail(
  client: AnnouncementClient,
  projectId: string,
  signal?: AbortSignal,
): Promise<{ fields: DetailFields } | { error: string }> {
  try {
    const detail = await client.projectDetail(projectId, signal);
    if (detail === null) {
      return { error: 'e-GP gave no project detail with a budget year for this project.' };
    }
    return { fields: { ...detail, detailCheckedAt: new Date().toISOString() } };
  } catch (error) {
    if (error instanceof RateLimitedError) throw error;
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** The detail fields of a record, as Discovery carries them onto the next one. */
export function detailOf(record: DetailFields): DetailFields {
  return {
    budgetYear: record.budgetYear,
    typeId: record.typeId,
    goodsId: record.goodsId,
    deptSubName: record.deptSubName,
    detailCheckedAt: record.detailCheckedAt,
  };
}
