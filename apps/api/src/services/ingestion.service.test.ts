import { describe, expect, test } from 'bun:test';
import { ConflictError } from '../core/errors';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { testEnv } from '../testing/env';
import { gatedDeps, silentLogger } from '../testing/gated-ingestion';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryScheduleStore } from '../testing/schedule-store';
import type { RunLog } from '../repositories/schedule.repository';
import { IngestionService, runMayContinue } from './ingestion.service';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function build(
  options: {
    fail?: boolean;
    heartbeatMs?: number;
    leaseTtlMs?: number;
    runLog?: RunLog;
    store?: InMemoryProcurementStore;
    env?: Parameters<typeof testEnv>[0];
  } = {},
) {
  const lease = new InMemoryIngestionLease();
  const schedule = new InMemoryScheduleStore();
  const { deps, open, calls } = gatedDeps(options.fail);
  const service = new IngestionService(
    options.store ?? new InMemoryProcurementStore(),
    testEnv(options.env),
    silentLogger,
    {
      lease,
      runLog: options.runLog ?? schedule,
      ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
      ...(options.leaseTtlMs !== undefined ? { leaseTtlMs: options.leaseTtlMs } : {}),
    },
    deps,
  );
  return { service, lease, schedule, open, calls };
}

describe('the number of runners', () => {
  const recordsInProgress = async (runners: number) => {
    const store = new InMemoryProcurementStore();
    const { deps } = gatedDeps();
    const base = (id: string) => ({
      projectId: id,
      projectName: 'จ้างพัฒนาระบบสารสนเทศ',
      deptName: 'x',
      deptSubName: null,
      province: null,
      district: null,
      subdistrict: null,
      deptCode: '1',
      year: 2568,
      announceDate: null,
      projectTypeName: null,
      purchaseMethodName: null,
      projectMoney: null,
      priceBuild: null,
      status: 'open' as const,
      statusSource: null,
      state: 'Queued' as const,
      outcome: 'queued' as const,
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
    });
    for (const id of ['1', '2', '3']) await store.upsert(base(id));

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const service = new IngestionService(
      store,
      testEnv({ EGP_RUNNERS: runners }),
      silentLogger,
      { lease: new InMemoryIngestionLease(), runLog: new InMemoryScheduleStore() },
      {
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
        resolveZipId: async () => {
          await held;
          return null;
        },
      },
    );
    await service.startRun({ forceDiscovery: true });
    await settle();
    const { items } = await store.find({ outcome: 'downloading', limit: 50, offset: 0 });
    release();
    await settle();
    return items.length;
  };

  test('is the configured number of records taken up at once', async () => {
    expect(await recordsInProgress(1)).toBe(1);
    expect(await recordsInProgress(2)).toBe(2);
  });
});

describe('IngestionService.startRun', () => {
  test('returns at once, and the run shows as in progress until it finishes', async () => {
    const { service, open } = build();

    await service.startRun({});
    expect((await service.summary()).runInProgress).toBe(true);

    open();
    await settle();
    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('a second start while one is going is refused with a conflict', async () => {
    const { service, open } = build();
    await service.startRun({});

    await expect(service.startRun({})).rejects.toThrow(ConflictError);
    await expect(service.startRun({})).rejects.toThrow('An ingestion run is already in progress.');
    open();
    await settle();
  });

  test('a finished run frees the way for the next', async () => {
    const { service, open } = build();
    await service.startRun({});
    open();
    await settle();

    await service.startRun({});
    expect((await service.summary()).runInProgress).toBe(true);
  });

  test('a run that fails still releases the lease', async () => {
    const { service, open } = build({ fail: true });
    await service.startRun({});

    open();
    await settle();

    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('a run held by someone else — another process, a job — counts as in progress', async () => {
    const { service, lease } = build();
    await lease.acquire('a-job-elsewhere', new Date(), 60_000);

    expect((await service.summary()).runInProgress).toBe(true);
    await expect(service.startRun({})).rejects.toThrow(ConflictError);
  });

  test('a heartbeat keeps a long run alive past the lease expiry', async () => {
    // Without heartbeats this 60ms lease would lapse long before 200ms.
    const { service, open } = build({ heartbeatMs: 10, leaseTtlMs: 60 });
    await service.startRun({});

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await service.summary()).runInProgress).toBe(true);

    open();
    await settle();
    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('records when a run started, so a schedule counts from it — manual or scheduled alike', async () => {
    const { service, schedule, open } = build();
    const before = Date.now();

    await service.startRun({});

    expect(schedule.runStarts).toHaveLength(1);
    const noted = Date.parse(schedule.runStarts[0] ?? '');
    expect(noted).toBeGreaterThanOrEqual(before);
    expect(noted).toBeLessThanOrEqual(Date.now());
    open();
    await settle();
  });

  test('a refused start records nothing, since no run began', async () => {
    const { service, schedule, open } = build();
    await service.startRun({});

    await expect(service.startRun({})).rejects.toThrow(ConflictError);

    expect(schedule.runStarts).toHaveLength(1);
    open();
    await settle();
  });

  test('if the start cannot be recorded, no run begins and the lease is given back', async () => {
    const failing: RunLog = {
      markRunStarted: async () => {
        throw new Error('mongo went away');
      },
    };
    const { service } = build({ runLog: failing });

    await expect(service.startRun({})).rejects.toThrow('mongo went away');

    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('work asked for before the run happens once the lease is held, and before the sweep', async () => {
    const { service, open, calls } = build();
    const seen: Array<{ held: boolean; sweeps: number }> = [];

    await service.startRun({
      beforeRun: async () => {
        seen.push({ held: (await service.summary()).runInProgress, sweeps: calls.discover });
      },
    });

    expect(seen).toEqual([{ held: true, sweeps: 0 }]);
    open();
    await settle();
  });

  test('work asked for before the run does not happen when the start is refused', async () => {
    const { service, open } = build();
    await service.startRun({});
    let ran = false;

    await expect(
      service.startRun({
        beforeRun: async () => {
          ran = true;
        },
      }),
    ).rejects.toThrow(ConflictError);

    expect(ran).toBe(false);
    open();
    await settle();
  });

  test('if the work asked for before the run fails, no run begins, nothing is recorded and the lease is given back', async () => {
    const { service, schedule, calls } = build();

    await expect(
      service.startRun({
        beforeRun: async () => {
          throw new Error('mongo went away');
        },
      }),
    ).rejects.toThrow('mongo went away');

    expect(schedule.runStarts).toHaveLength(0);
    expect(calls.discover).toBe(0);
    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('a crashed holder does not block for ever: an expired lease lets a new run start', async () => {
    const { service, lease } = build();
    await lease.acquire('crashed', new Date(Date.now() - 10 * 60_000), 60_000);

    expect((await service.summary()).runInProgress).toBe(false);
    await service.startRun({});
  });
});

describe('runMayContinue', () => {
  const TTL = 120_000;

  test('a run whose lease was confirmed recently may continue', () => {
    expect(runMayContinue({ lost: false, confirmedAt: 1_000 }, 1_000 + TTL - 1, TTL)).toBe(true);
  });

  test('a run whose lease was taken over must stop', () => {
    expect(runMayContinue({ lost: true, confirmedAt: 1_000 }, 1_001, TTL)).toBe(false);
  });

  test('a run that could not reach the lease for a whole ttl must stop, since another may hold it now', () => {
    expect(runMayContinue({ lost: false, confirmedAt: 1_000 }, 1_000 + TTL, TTL)).toBe(false);
  });
});

describe('IngestionService and the discovery sweep', () => {
  const finish = async (service: IngestionService, open: () => void, force = false) => {
    await service.startRun({ ...(force ? { forceDiscovery: true } : {}) });
    open();
    await settle();
  };

  test('a second run soon after the first does not sweep upstream again', async () => {
    const { service, open, calls } = build();

    await finish(service, open);
    await finish(service, open);

    expect(calls.discover).toBe(1);
  });

  test('an administrator can force the sweep', async () => {
    const { service, open, calls } = build();

    await finish(service, open);
    await finish(service, open, true);

    expect(calls.discover).toBe(2);
  });
});
