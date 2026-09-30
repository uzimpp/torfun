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
  } = {},
) {
  const lease = new InMemoryIngestionLease();
  const schedule = new InMemoryScheduleStore();
  const { deps, open } = gatedDeps(options.fail);
  const service = new IngestionService(
    new InMemoryProcurementStore(),
    testEnv(),
    silentLogger,
    {
      lease,
      runLog: options.runLog ?? schedule,
      ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
      ...(options.leaseTtlMs !== undefined ? { leaseTtlMs: options.leaseTtlMs } : {}),
    },
    deps,
  );
  return { service, lease, schedule, open };
}

describe('IngestionService.startRun', () => {
  test('returns at once, and the run shows as in progress until it finishes', async () => {
    const { service, open } = build();

    await service.startRun({ eBiddingOnly: true });
    expect((await service.summary()).runInProgress).toBe(true);

    open();
    await settle();
    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('a second start while one is going is refused with a conflict', async () => {
    const { service, open } = build();
    await service.startRun({ eBiddingOnly: true });

    await expect(service.startRun({ eBiddingOnly: true })).rejects.toThrow(ConflictError);
    await expect(service.startRun({ eBiddingOnly: true })).rejects.toThrow(
      'An ingestion run is already in progress.',
    );
    open();
    await settle();
  });

  test('a finished run frees the way for the next', async () => {
    const { service, open } = build();
    await service.startRun({ eBiddingOnly: true });
    open();
    await settle();

    await service.startRun({ eBiddingOnly: true });
    expect((await service.summary()).runInProgress).toBe(true);
  });

  test('a run that fails still releases the lease', async () => {
    const { service, open } = build({ fail: true });
    await service.startRun({ eBiddingOnly: true });

    open();
    await settle();

    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('a run held by someone else — another process, a job — counts as in progress', async () => {
    const { service, lease } = build();
    await lease.acquire('a-job-elsewhere', new Date(), 60_000);

    expect((await service.summary()).runInProgress).toBe(true);
    await expect(service.startRun({ eBiddingOnly: true })).rejects.toThrow(ConflictError);
  });

  test('a heartbeat keeps a long run alive past the lease expiry', async () => {
    // Without heartbeats this 60ms lease would lapse long before 200ms.
    const { service, open } = build({ heartbeatMs: 10, leaseTtlMs: 60 });
    await service.startRun({ eBiddingOnly: true });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await service.summary()).runInProgress).toBe(true);

    open();
    await settle();
    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('records when a run started, so a schedule counts from it — manual or scheduled alike', async () => {
    const { service, schedule, open } = build();
    const before = Date.now();

    await service.startRun({ eBiddingOnly: true });

    expect(schedule.runStarts).toHaveLength(1);
    const noted = Date.parse(schedule.runStarts[0] ?? '');
    expect(noted).toBeGreaterThanOrEqual(before);
    expect(noted).toBeLessThanOrEqual(Date.now());
    open();
    await settle();
  });

  test('a refused start records nothing, since no run began', async () => {
    const { service, schedule, open } = build();
    await service.startRun({ eBiddingOnly: true });

    await expect(service.startRun({ eBiddingOnly: true })).rejects.toThrow(ConflictError);

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

    await expect(service.startRun({ eBiddingOnly: true })).rejects.toThrow('mongo went away');

    expect((await service.summary()).runInProgress).toBe(false);
  });

  test('a crashed holder does not block for ever: an expired lease lets a new run start', async () => {
    const { service, lease } = build();
    await lease.acquire('crashed', new Date(Date.now() - 10 * 60_000), 60_000);

    expect((await service.summary()).runInProgress).toBe(false);
    await service.startRun({ eBiddingOnly: true });
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
