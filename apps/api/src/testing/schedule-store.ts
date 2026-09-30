import { DEFAULT_SCHEDULE, type Schedule, type ScheduleUpdate } from '@torfun/types';
import type { ScheduleStore, StoredSchedule } from '../repositories/schedule.repository';

/**
 * An in-memory `ScheduleStore`. Like the Mongo one, the setting and the last
 * run are independent: saving never erases the last run, noting a run never
 * touches the setting.
 */
export class InMemoryScheduleStore implements ScheduleStore {
  private schedule: Schedule = DEFAULT_SCHEDULE;
  private lastRunStartedAt: string | null = null;
  /** Every start ever noted, so a test can tell one run from two in the same minute. */
  readonly runStarts: string[] = [];

  async get(): Promise<StoredSchedule> {
    return { schedule: this.schedule, lastRunStartedAt: this.lastRunStartedAt };
  }

  async save(update: ScheduleUpdate, updatedBy: string, at: string): Promise<Schedule> {
    this.schedule = { ...update, updatedAt: at, updatedBy };
    return this.schedule;
  }

  async markRunStarted(at: string): Promise<void> {
    this.lastRunStartedAt = at;
    this.runStarts.push(at);
  }
}
