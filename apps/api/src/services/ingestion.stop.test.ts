import { describe, expect, test } from 'bun:test';
import { EMPTY_MILESTONES, type Procurement } from '@torfun/types';
import { ConflictError } from '../core/errors';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { testEnv } from '../testing/env';
import { gatedDeps, silentLogger } from '../testing/gated-ingestion';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryScheduleStore } from '../testing/schedule-store';
import { InMemoryIngestionRunStore, noStats } from '../testing/ingestion-run-store';
import { IngestionService } from './ingestion.service';

/**
 * Stopping a Run is graceful: nobody takes a new record, a record already in
 * flight finishes as it would have, and what is left stays Queued with no
 * attempt spent. The request lives on the lease, so any API instance can make
 * it and the Run, wherever it is, sees it.
 */

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function queued(projectId: string): Procurement {
  return {
    projectId,
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'x',
    deptSubName: null,
    province: null,
    district: null,
    subdistrict: null,
    deptCode: '1',
    budgetYear: 2568,
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: null,
    priceBuild: null,
    status: 'open',
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
    statusHistory: [],
    zipId: null,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-09T00:00:00.000Z',
  };
}

async function build(options: { records?: number; heartbeatMs?: number } = {}) {
  const store = new InMemoryProcurementStore();
  for (let i = 0; i < (options.records ?? 4); i += 1) await store.upsert(queued(`p${i}`));
  const lease = new InMemoryIngestionLease();
  const { deps } = gatedDeps();

  // The first site request waits until the test lets it go, so a stop can be
  // asked for while one record is demonstrably in flight.
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => (release = resolve));
  const asked: string[] = [];
  const service = new IngestionService(
    store,
    testEnv({ EGP_RUNNERS: 1 }),
    silentLogger,
    {
      lease,
      runLog: new InMemoryScheduleStore(),
      runs: new InMemoryIngestionRunStore(),
      stats: noStats,
      ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
    },
    () => ({
      ...deps,
      discoverProjects: async () => ({
        records: [],
        rejected: [],
        notEBidding: 0,
        tombstoned: 0,
        resolutions: [],
        failures: [],
        rateLimited: false,
        budgetReached: false,
        quota: null,
        ranAt: new Date().toISOString(),
      }),
      resolveZipId: async (projectId: string) => {
        asked.push(projectId);
        if (asked.length === 1) await blocked;
        return null;
      },
    }),
  );
  return { service, store, lease, release: () => release(), asked };
}

const outcomes = async (store: InMemoryProcurementStore) =>
  Object.fromEntries(
    (await store.find({ limit: 50, offset: 0 })).items.map((r) => [r.projectId, r.outcome]),
  );

describe('stopping a Run', () => {
  test('lets the record in flight finish, takes no new one, and leaves the rest queued untouched', async () => {
    const { service, store, release, asked } = await build();
    await service.startRun({});
    await settle();

    await service.requestStop('admin-1');
    release();
    await settle(60);

    expect(asked).toEqual(['p0']);
    const done = await outcomes(store);
    expect(done['p0']).toBe('no_tor_package'); // finished as it would have
    for (const id of ['p1', 'p2', 'p3']) expect(done[id]).toBe('queued');
    for (const id of ['p1', 'p2', 'p3']) expect((await store.get(id))?.attempts).toBe(0);
    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('asking twice is the same as asking once', async () => {
    const { service, release } = await build();
    await service.startRun({});
    await settle();

    await service.requestStop('admin-1');
    await expect(service.requestStop('admin-2')).resolves.toBeUndefined();
    release();
    await settle(60);
  });

  test('with no Run in progress there is nothing to stop, and it says so', async () => {
    const { service } = await build();

    await expect(service.requestStop('admin-1')).rejects.toThrow(ConflictError);
  });

  test('a request made through the lease, as another API instance would, is seen at the next heartbeat', async () => {
    const { service, lease, store, release, asked } = await build({ heartbeatMs: 10 });
    await service.startRun({});
    await settle();

    await lease.requestStop('admin-elsewhere', new Date());
    await settle(50); // several heartbeats
    release();
    await settle(60);

    expect(asked).toEqual(['p0']);
    expect((await outcomes(store))['p1']).toBe('queued');
  });

  test('the summary says when the Run began and whether it has been asked to stop', async () => {
    const { service, release } = await build();
    expect(await service.summary()).toMatchObject({
      runInProgress: false,
      runStartedAt: null,
      stopRequested: false,
    });

    await service.startRun({});
    await settle();
    const running = await service.summary();
    expect(running.runInProgress).toBe(true);
    expect(running.runStartedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(running.stopRequested).toBe(false);

    await service.requestStop('admin-1');
    expect((await service.summary()).stopRequested).toBe(true);
    release();
    await settle(60);
  });

  test('a stop does not leak into the next Run, which works through what was left', async () => {
    const { service, store, release, asked } = await build();
    await service.startRun({});
    await settle();
    await service.requestStop('admin-1');
    release();
    await settle(60);

    await service.startRun({});
    await settle(60);

    expect(asked).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect((await outcomes(store))['p3']).toBe('no_tor_package');
  });
});
