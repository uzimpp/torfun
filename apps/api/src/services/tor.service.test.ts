import { describe, expect, test } from 'bun:test';
import { NotFoundError } from '../core/errors';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { TorService } from './tor.service';

/**
 * The held list links each record's source PDF, so an administrator must be able
 * to reach the source of a record officers cannot see.
 */
describe('the source of a held procurement', () => {
  const held = {
    projectId: 'held-1',
    zipId: 'zip-1',
    outcome: 'needs_review',
    documents: [{ role: 'main_tor', member: 'a.pdf', filename: 'a.pdf' }],
  } as never;

  async function build() {
    const store = new InMemoryProcurementStore();
    await store.upsert(held);
    const downloaded: string[] = [];
    const service = new TorService(store, async (zipId) => {
      downloaded.push(zipId);
      throw new Error('reached the download');
    });
    return { service, downloaded };
  }

  test('is reached by an administrator, who is let as far as the download', async () => {
    const { service, downloaded } = await build();

    await expect(service.source('held-1', 'admin')).rejects.toThrow('reached the download');

    expect(downloaded).toEqual(['zip-1']);
  });

  test('is not found by an officer, and nothing is downloaded', async () => {
    const { service, downloaded } = await build();

    await expect(service.source('held-1', 'officer')).rejects.toBeInstanceOf(NotFoundError);

    expect(downloaded).toEqual([]);
  });
});
