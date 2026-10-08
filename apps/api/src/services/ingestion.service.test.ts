import { describe, expect, test } from 'bun:test';
import {
  EMPTY_MILESTONES,
  RunCountsSchema,
  type IngestionStats,
  type LeaseLive,
} from '@torfun/types';
import { ConflictError } from '../core/errors';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { testEnv } from '../testing/env';
import { gatedDeps, silentLogger } from '../testing/gated-ingestion';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryScheduleStore } from '../testing/schedule-store';
import { InMemoryIngestionRunStore, noStats } from '../testing/ingestion-run-store';
import type { FindOptions } from '../repositories/procurement.repository';
import type { IngestionDeps } from './egp/pipeline';
import type { ModelUsage } from './vertex/vertex-ai';
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
    /** Model calls a Run's discovery makes, as the real stages would report them. */
    usage?: ModelUsage[];
    now?: () => Date;
  } = {},
) {
  const lease = new InMemoryIngestionLease();
  const schedule = new InMemoryScheduleStore();
  const runs = new InMemoryIngestionRunStore();
  const { deps, open, calls } = gatedDeps(options.fail);
  const service = new IngestionService(
    options.store ?? new InMemoryProcurementStore(),
    testEnv(options.env),
    silentLogger,
    {
      lease,
      runLog: options.runLog ?? schedule,
      runs,
      stats: noStats,
      ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
      ...(options.leaseTtlMs !== undefined ? { leaseTtlMs: options.leaseTtlMs } : {}),
      ...(options.now ? { now: options.now } : {}),
    },
    (onUsage): IngestionDeps => ({
      ...deps,
      discoverProjects: async (...args) => {
        for (const usage of options.usage ?? []) onUsage(usage);
        return deps.discoverProjects(...args);
      },
    }),
  );
  return { service, lease, schedule, runs, open, calls };
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
      deptCode: '1',
      budgetYear: 2568,
      announceDate: null,
      projectTypeName: null,
      purchaseMethodName: null,
      projectMoney: null,
      priceBuild: null,
      status: 'open' as const,
      milestones: EMPTY_MILESTONES,
      timelineCheckedAt: null,
      deadlineAt: null,
      deadlineSource: null,
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
      {
        lease: new InMemoryIngestionLease(),
        runLog: new InMemoryScheduleStore(),
        runs: new InMemoryIngestionRunStore(),
        stats: noStats,
      },
      () => ({
        ...deps,
        discoverProjects: async () => ({
          records: [],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: new Date().toISOString(),
        }),
        resolveZipId: async () => {
          await held;
          return null;
        },
      }),
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

describe('the run log', () => {
  const usage = (prompt: number, output: number, thoughts: number): ModelUsage => ({
    prompt,
    output,
    thoughts,
    total: prompt + output + thoughts,
  });

  test('a finished run is logged once, with how it was started, its counts and the tokens it spent', async () => {
    const { service, runs, open } = build({
      env: { EGP_RUNNERS: 3 },
      usage: [usage(1000, 200, 50), usage(500, 100, 25)],
    });

    await service.startRun({});
    expect(runs.runs).toHaveLength(0);
    open();
    await settle();

    expect(runs.runs).toHaveLength(1);
    const [run] = runs.runs;
    expect(run).toMatchObject({
      trigger: 'manual',
      runners: 3,
      error: null,
      tokens: { prompt: 1500, output: 300, thoughts: 75, total: 1875, calls: 2 },
      counts: { discovered: 0, attempted: 0, aborted: false, stopped: null },
    });
    expect(Date.parse(run?.endedAt ?? '') - Date.parse(run?.startedAt ?? '')).toBe(
      run?.durationMs ?? -1,
    );
    expect(run).not.toHaveProperty('peakRssBytes');
    expect(Object.keys(run?.counts ?? {}).sort()).toEqual(
      Object.keys(RunCountsSchema.shape).sort(),
    );
  });

  test('a scheduled start is logged as scheduled', async () => {
    const { service, runs, open } = build();

    await service.startRun({ trigger: 'scheduled' });
    open();
    await settle();

    expect(runs.runs[0]?.trigger).toBe('scheduled');
  });

  test('a run that threw is logged with why, and no counts', async () => {
    const { service, runs, open } = build({ fail: true });

    await service.startRun({});
    open();
    await settle();

    expect(runs.runs).toEqual([
      expect.objectContaining({ counts: null, error: 'upstream exploded' }),
    ]);
  });

  test("one run's tokens are not counted again in the next", async () => {
    const { service, runs, open } = build({ usage: [usage(10, 2, 1)] });

    await service.startRun({ forceDiscovery: true });
    open();
    await settle();
    await service.startRun({ forceDiscovery: true });
    await settle();

    expect(runs.runs.map((run) => run.tokens.calls)).toEqual([1, 1]);
  });
});

describe('the heartbeat of a live run', () => {
  test('reports the record in flight and nothing else, readable through the lease', async () => {
    const store = new InMemoryProcurementStore();
    await store.upsert({
      projectId: '67019000001',
      projectName: 'จ้างพัฒนาระบบสารสนเทศ',
      deptName: 'x',
      deptSubName: null,
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
      torAmbiguous: false,
      discoveredAt: '2026-09-09T00:00:00.000Z',
      sourceHash: null,
      updatedAt: '2026-09-09T00:00:00.000Z',
    });
    const lease = new InMemoryIngestionLease();
    const { deps } = gatedDeps();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const service = new IngestionService(
      store,
      testEnv({ EGP_RUNNERS: 1 }),
      silentLogger,
      {
        lease,
        runLog: new InMemoryScheduleStore(),
        runs: new InMemoryIngestionRunStore(),
        stats: noStats,
        heartbeatMs: 10,
      },
      () => ({
        ...deps,
        discoverProjects: async () => ({
          records: [],
          notEBidding: 0,
          tombstoned: 0,
          truncated: 0,
          failures: [],
          rateLimited: false,
          cursor: {},
          ranAt: new Date().toISOString(),
        }),
        resolveZipId: async () => {
          await held;
          return null;
        },
      }),
    );

    await service.startRun({ forceDiscovery: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const live = (await lease.current(new Date()))?.live;
    release();
    await settle();

    expect(live?.inFlight).toEqual([
      expect.objectContaining({
        slot: 0,
        projectId: '67019000001',
        projectName: 'จ้างพัฒนาระบบสารสนเทศ',
        stage: 'info',
        fresh: true,
      }),
    ]);
    expect(live?.queueRemaining).toBe(0);
    expect(Object.keys(live ?? {}).sort()).toEqual(['inFlight', 'queueRemaining']);
  });
});

describe('IngestionService.ops', () => {
  const live: LeaseLive = {
    inFlight: [
      {
        slot: 0,
        projectId: '67019000001',
        projectName: 'จ้างพัฒนาระบบ',
        stage: 'analysis',
        fresh: true,
        since: '2026-10-04T03:08:00.000Z',
      },
    ],
    queueRemaining: 12,
  };

  test('shows a run going on another instance from what its heartbeat left on the lease', async () => {
    const now = new Date('2026-10-04T03:09:06.000Z');
    const { service, lease } = build({ now: () => now });
    await lease.acquire('elsewhere', new Date('2026-10-04T03:00:00.000Z'), 60 * 60_000);
    await lease.heartbeat('elsewhere', new Date('2026-10-04T03:09:00.000Z'), 60 * 60_000, live);

    expect((await service.ops()).live).toEqual({
      runInProgress: true,
      runStartedAt: '2026-10-04T03:00:00.000Z',
      elapsedMs: 546_000,
      stopRequested: false,
      inFlight: live.inFlight,
      queueRemaining: 12,
    });
  });

  test('with no run going there is nothing live to show', async () => {
    const { service } = build();

    expect((await service.ops()).live).toEqual({
      runInProgress: false,
      runStartedAt: null,
      elapsedMs: null,
      stopRequested: false,
      inFlight: null,
      queueRemaining: null,
    });
  });

  test('reads stored history over the last 30 days, and the latest runs', async () => {
    const now = new Date('2026-10-04T00:00:00.000Z');
    const asked: [string, number][] = [];
    const stats: IngestionStats = {
      throughputDaily: [{ date: '2026-10-03', completed: 3, held: 0, failed: 1 }],
      discoveredDaily: [{ date: '2026-10-03', discovered: 7 }],
    };
    const runs = new InMemoryIngestionRunStore();
    const service = new IngestionService(
      new InMemoryProcurementStore(),
      testEnv(),
      silentLogger,
      {
        lease: new InMemoryIngestionLease(),
        runLog: new InMemoryScheduleStore(),
        runs,
        stats: {
          stats: async (at, days) => {
            asked.push([at, days]);
            return stats;
          },
        },
        now: () => now,
      },
      () => gatedDeps().deps,
    );
    for (let day = 1; day <= 25; day += 1) {
      const endedAt = new Date(Date.UTC(2026, 8, day)).toISOString();
      await runs.record({
        id: `run-${day}`,
        startedAt: endedAt,
        endedAt,
        durationMs: 0,
        trigger: 'manual',
        runners: 1,
        counts: null,
        error: 'x',
        tokens: { prompt: 0, output: 0, thoughts: 0, total: 0, calls: 0 },
      });
    }

    const ops = await service.ops();

    expect(asked).toEqual([['2026-10-04T00:00:00.000Z', 30]]);
    expect(ops).toMatchObject(stats);
    expect(ops.runs).toHaveLength(20);
    expect(ops.runs[0]?.id).toBe('run-25');
  });
});

describe('IngestionService.list', () => {
  const asked = async (options: Partial<FindOptions>, audience: 'admin' | 'officer') => {
    const store = new InMemoryProcurementStore();
    const seen: FindOptions[] = [];
    const find = store.find.bind(store);
    store.find = (query) => {
      seen.push(query);
      return find(query);
    };
    const { service } = build({ store });
    await service.list({ limit: 50, offset: 0, ...options }, audience);
    return seen[0];
  };

  test('the held list comes most urgent first', async () => {
    expect((await asked({ outcome: 'needs_review' }, 'admin'))?.order).toBe('urgency');
  });

  test('every other list keeps the newest announcement first', async () => {
    expect((await asked({}, 'admin'))?.order).toBeUndefined();
    expect((await asked({ outcome: 'needs_review' }, 'officer'))?.order).toBeUndefined();
  });
});
