import type { ScheduleUpdate, ScheduleView } from '@torfun/types';
import type { ScheduleStore } from '../repositories/schedule.repository';
import { nextDueAt, upcomingRuns } from './schedule';

/** How many coming runs the view lists. */
const UPCOMING_RUNS = 3;

/**
 * The Schedule an administrator reads and sets: the setting, plus what it
 * implies — when a Run last started and when the next is due.
 *
 * Saving stamps the time and the administrator. The time matters beyond
 * bookkeeping: it is what a never-run schedule counts from, so switching a
 * schedule on waits for the next slot instead of starting a Run on the spot.
 */
export class ScheduleService {
  constructor(
    private readonly store: ScheduleStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(): Promise<ScheduleView> {
    const { schedule, lastRunStartedAt } = await this.store.get();
    return {
      ...schedule,
      lastRunAt: lastRunStartedAt,
      nextRunAt: nextDueAt(schedule, lastRunStartedAt),
      upcomingRunAts: upcomingRuns(schedule, lastRunStartedAt, UPCOMING_RUNS),
    };
  }

  async update(update: ScheduleUpdate, adminId: string): Promise<ScheduleView> {
    await this.store.save(update, adminId, this.now().toISOString());
    return this.get();
  }
}
