import type { ScheduleUpdate } from '@torfun/types';
import { describe, expect, mock, test } from 'bun:test';
import { ConflictError } from '../core/errors';
import { gatedDeps, silentLogger } from '../testing/gated-ingestion';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { testEnv } from '../testing/env';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryScheduleStore } from '../testing/schedule-store';
import { InMemoryIngestionRunStore, noStats } from '../testing/ingestion-run-store';
import { IngestionService } from './ingestion.service';
import { SchedulerService } from './scheduler.service';

/** 02:00 in Bangkok is 19:00 UTC the day before. */
const daily: ScheduleUpdate = {
  enabled: true,
  mode: 'weekly',
  timeOfDay: '02:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  everyHours: 24,
};
const SWITCHED_ON = '2026-10-01T05:00:00.000Z';
const BEFORE_SLOT = new Date('2026-10-01T18:59:59.000Z');
const SLOT = new Date('2026-10-01T19:00:00.000Z');

/**
 * The scheduler over a REAL ingestion service, so "one run" is the lease's
 * doing, not a stub's. One shared clock feeds both, as the real clock does in
 * production — the recorded start and the tick must agree on what time it is.
 */
function build() {
  const clock = { now: SLOT };
  const lease = new InMemoryIngestionLease();
  const schedule = new InMemoryScheduleStore();
  const { deps, open } = gatedDeps();
  const ingestion = new IngestionService(
    new InMemoryProcurementStore(),
    testEnv(),
    silentLogger,
    {
      lease,
      runLog: schedule,
      runs: new InMemoryIngestionRunStore(),
      stats: noStats,
      now: () => clock.now,
    },
    () => deps,
  );
  const scheduler = new SchedulerService(
    schedule,
    (input) => ingestion.startRun(input),
    silentLogger,
  );
  return { scheduler, schedule, lease, ingestion, open, clock };
}

describe('SchedulerService.tick', () => {
  test('starts a run when the schedule is due', async () => {
    const { scheduler, schedule, ingestion, open } = build();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);

    expect(await scheduler.tick(SLOT)).toBe('started');
    expect((await ingestion.summary()).runInProgress).toBe(true);
    open();
  });

  test('does nothing before the slot', async () => {
    const { scheduler, schedule, ingestion } = build();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);

    expect(await scheduler.tick(BEFORE_SLOT)).toBe('not-due');
    expect((await ingestion.summary()).runInProgress).toBe(false);
    expect(schedule.runStarts).toHaveLength(0);
  });

  test('does nothing while the schedule is off — the default', async () => {
    const { scheduler, schedule } = build();

    expect(await scheduler.tick(new Date('2027-01-01T00:00:00.000Z'))).toBe('not-due');
    await schedule.save({ ...daily, enabled: false }, 'admin-1', SWITCHED_ON);
    expect(await scheduler.tick(new Date('2027-01-01T00:00:00.000Z'))).toBe('not-due');
    expect(schedule.runStarts).toHaveLength(0);
  });

  test('two ticks in the same minute start one run, not two', async () => {
    const { scheduler, schedule, open, clock } = build();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);

    const first = await scheduler.tick(SLOT);
    clock.now = new Date(SLOT.getTime() + 30_000);
    const second = await scheduler.tick(clock.now);

    expect(first).toBe('started');
    expect(second).toBe('not-due');
    expect(schedule.runStarts).toHaveLength(1);
    open();
  });

  test('when another runner holds the lease, it waits and starts nothing', async () => {
    const { scheduler, schedule, lease } = build();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);
    await lease.acquire('a-manual-run-elsewhere', SLOT, 60_000);

    expect(await scheduler.tick(SLOT)).toBe('busy');
    expect(schedule.runStarts).toHaveLength(0);
  });

  test('after being busy it is still due, and runs once the lease is free', async () => {
    const { scheduler, schedule, lease, clock } = build();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);
    await lease.acquire('a-manual-run-elsewhere', SLOT, 60_000);
    await scheduler.tick(SLOT);

    await lease.release('a-manual-run-elsewhere');
    clock.now = new Date(SLOT.getTime() + 60_000);

    expect(await scheduler.tick(clock.now)).toBe('started');
  });

  test('starts the same Run a manual start would: e-bidding only, default cap', async () => {
    const schedule = new InMemoryScheduleStore();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);
    const startRun = mock(async () => {});

    await new SchedulerService(schedule, startRun, silentLogger).tick(SLOT);

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun).toHaveBeenCalledWith({ trigger: 'scheduled' });
  });

  test('a failure to start is reported, not thrown into the timer', async () => {
    const schedule = new InMemoryScheduleStore();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);
    const error = mock(() => {});
    const logger = { ...silentLogger, error } as unknown as typeof silentLogger;
    const startRun = async () => {
      throw new Error('mongo went away');
    };

    expect(await new SchedulerService(schedule, startRun, logger).tick(SLOT)).toBe('failed');
    expect(error).toHaveBeenCalledTimes(1);
  });

  test('a conflict is the expected way to lose a race and is not an error', async () => {
    const schedule = new InMemoryScheduleStore();
    await schedule.save(daily, 'admin-1', SWITCHED_ON);
    const error = mock(() => {});
    const logger = { ...silentLogger, error } as unknown as typeof silentLogger;
    const startRun = async () => {
      throw new ConflictError('An ingestion run is already in progress.');
    };

    expect(await new SchedulerService(schedule, startRun, logger).tick(SLOT)).toBe('busy');
    expect(error).not.toHaveBeenCalled();
  });
});

describe('SchedulerService timer', () => {
  test('ticks on its interval until stopped', async () => {
    const schedule = new InMemoryScheduleStore();
    const reads = mock(schedule.get.bind(schedule));
    schedule.get = reads;
    const scheduler = new SchedulerService(schedule, async () => {}, silentLogger);

    scheduler.start(10);
    await new Promise((resolve) => setTimeout(resolve, 60));
    scheduler.stop();
    const atStop = reads.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(atStop).toBeGreaterThanOrEqual(2);
    expect(reads.mock.calls.length).toBe(atStop);
  });

  test('starting twice does not double the timer', async () => {
    const schedule = new InMemoryScheduleStore();
    const reads = mock(schedule.get.bind(schedule));
    schedule.get = reads;
    const scheduler = new SchedulerService(schedule, async () => {}, silentLogger);

    scheduler.start(20);
    scheduler.start(20);
    await new Promise((resolve) => setTimeout(resolve, 70));
    scheduler.stop();

    // One timer over 70ms at 20ms is at most about 4 ticks; two timers would be about 8.
    expect(reads.mock.calls.length).toBeLessThanOrEqual(5);
  });
});
