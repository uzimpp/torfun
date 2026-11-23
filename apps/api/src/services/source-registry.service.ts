import {
  MAX_SOURCE_AGENCIES,
  type SourceAgency,
  type SourceAgencyEdit,
  type SourceAgencyInput,
  type SourceRegistryView,
} from '@torfun/types';
import { ConflictError, NotFoundError } from '../core/errors';
import type { SourceRegistryStore } from '../repositories/source-registry.repository';
import { FEED_REGISTRY } from './egp/constants';

/**
 * The agencies already verified against the feed: the registry as shipped, and
 * what "available" offers back after one is removed. The feed has no list
 * endpoint, and the process5 search that could enumerate agencies is behind
 * Cloudflare Turnstile, so no list is fetched at runtime (and this adds no
 * request to the site).
 */
export const KNOWN_AGENCIES: ReadonlyArray<SourceAgency> = FEED_REGISTRY.map(
  ({ deptId, deptName }) => ({ deptId, deptName }),
);

/**
 * The Source Registry an administrator manages (FR-40). Until it is first
 * changed it is the shipped list, so a fresh deployment reads what it always did.
 *
 * Removing an agency only stops Discovery asking for it from the next Run. It
 * deletes nothing: records already ingested stay, and so does the agency's Feed
 * Cursor, so adding it back resumes where it left off.
 */
export class SourceRegistryService {
  constructor(
    private readonly store: SourceRegistryStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The agencies the next Run reads. */
  async agencies(): Promise<SourceAgency[]> {
    const stored = await this.store.get();
    return stored ? stored.agencies : KNOWN_AGENCIES.map((agency) => ({ ...agency }));
  }

  async get(): Promise<SourceRegistryView> {
    const stored = await this.store.get();
    const items = stored ? stored.agencies : KNOWN_AGENCIES.map((agency) => ({ ...agency }));
    const held = new Set(items.map((agency) => agency.deptId));
    return {
      items,
      available: KNOWN_AGENCIES.filter((agency) => !held.has(agency.deptId)).map((agency) => ({
        ...agency,
      })),
      isDefault: stored === null,
      updatedAt: stored?.updatedAt ?? null,
      updatedBy: stored?.updatedBy ?? null,
    };
  }

  async add(input: SourceAgencyInput, adminId: string): Promise<SourceRegistryView> {
    const items = await this.agencies();
    if (items.some((agency) => agency.deptId === input.deptId)) {
      throw new ConflictError(`Agency ${input.deptId} is already in the Source Registry.`);
    }
    if (items.length >= MAX_SOURCE_AGENCIES) {
      throw new ConflictError(`The Source Registry holds at most ${MAX_SOURCE_AGENCIES} agencies.`);
    }
    return this.save([...items, { deptId: input.deptId, deptName: input.deptName }], adminId);
  }

  async edit(deptId: string, edit: SourceAgencyEdit, adminId: string): Promise<SourceRegistryView> {
    const items = await this.agencies();
    if (!items.some((agency) => agency.deptId === deptId)) {
      throw new NotFoundError(`Agency ${deptId} is not in the Source Registry.`);
    }
    return this.save(
      items.map((agency) =>
        agency.deptId === deptId ? { deptId, deptName: edit.deptName } : agency,
      ),
      adminId,
    );
  }

  async remove(deptId: string, adminId: string): Promise<SourceRegistryView> {
    const items = await this.agencies();
    if (!items.some((agency) => agency.deptId === deptId)) {
      throw new NotFoundError(`Agency ${deptId} is not in the Source Registry.`);
    }
    return this.save(
      items.filter((agency) => agency.deptId !== deptId),
      adminId,
    );
  }

  private async save(items: SourceAgency[], adminId: string): Promise<SourceRegistryView> {
    await this.store.save(items, adminId, this.now().toISOString());
    return this.get();
  }
}
