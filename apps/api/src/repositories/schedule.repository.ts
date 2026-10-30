import type { Collection, Db } from 'mongodb';
import { ALL_WEEKDAYS, DEFAULT_SCHEDULE, type Schedule, type ScheduleUpdate } from '@torfun/types';
import { INGESTION_META_COLLECTION } from './ingestion-meta';

/**
 * Records that a Run started, so a Schedule can count from it. Split out
 * because the ingestion service needs only this much of the schedule store —
 * it must be able to note a Run without being able to change the setting.
 */
export interface RunLog {
  markRunStarted(at: string): Promise<void>;
}

export interface StoredSchedule {
  schedule: Schedule;
  /** When the last Run began, manual or scheduled; null if none has. */
  lastRunStartedAt: string | null;
}

export interface ScheduleStore extends RunLog {
  get(): Promise<StoredSchedule>;
  save(update: ScheduleUpdate, updatedBy: string, at: string): Promise<Schedule>;
}

/**
 * The setting and the last run's start share one document. Both are written by
 * separate `$set`s on named fields, so saving the setting never erases the last
 * run and noting a run never touches the setting — which is why every setting
 * field is optional here: a document may exist holding only the last run.
 */
interface ScheduleDocument {
  _id: string;
  enabled?: boolean;
  /** `daily` is the retired mode: it reads as weekly with every day ticked. */
  mode?: Schedule['mode'] | 'daily';
  time_of_day?: string;
  weekdays?: number[];
  every_hours?: number;
  updated_at?: string;
  updated_by?: string;
  last_run_started_at?: string;
}

const SCHEDULE_ID = 'schedule';

export class ScheduleRepository implements ScheduleStore {
  constructor(private readonly getDb: () => Promise<Db>) {}

  private async documents(): Promise<Collection<ScheduleDocument>> {
    return (await this.getDb()).collection<ScheduleDocument>(INGESTION_META_COLLECTION);
  }

  async get(): Promise<StoredSchedule> {
    const document = await (await this.documents()).findOne({ _id: SCHEDULE_ID });
    return {
      // Field by field over the default, so a document holding only the last
      // run still reads as a complete — and disabled — schedule.
      schedule: {
        enabled: document?.enabled ?? DEFAULT_SCHEDULE.enabled,
        mode: document?.mode === 'daily' ? 'weekly' : (document?.mode ?? DEFAULT_SCHEDULE.mode),
        timeOfDay: document?.time_of_day ?? DEFAULT_SCHEDULE.timeOfDay,
        // Never saved (every save writes `updated_at`): the default. Anything saved
        // before days were chosen — daily, or older than modes — was every day.
        weekdays:
          document?.weekdays ??
          (document?.updated_at === undefined ? [...DEFAULT_SCHEDULE.weekdays] : [...ALL_WEEKDAYS]),
        everyHours: document?.every_hours ?? DEFAULT_SCHEDULE.everyHours,
        updatedAt: document?.updated_at ?? null,
        updatedBy: document?.updated_by ?? null,
      },
      lastRunStartedAt: document?.last_run_started_at ?? null,
    };
  }

  async save(update: ScheduleUpdate, updatedBy: string, at: string): Promise<Schedule> {
    await (
      await this.documents()
    ).updateOne(
      { _id: SCHEDULE_ID },
      {
        $set: {
          enabled: update.enabled,
          mode: update.mode,
          time_of_day: update.timeOfDay,
          weekdays: update.weekdays,
          every_hours: update.everyHours,
          updated_at: at,
          updated_by: updatedBy,
        },
      },
      { upsert: true },
    );
    return { ...update, updatedAt: at, updatedBy };
  }

  async markRunStarted(at: string): Promise<void> {
    await (
      await this.documents()
    ).updateOne({ _id: SCHEDULE_ID }, { $set: { last_run_started_at: at } }, { upsert: true });
  }
}
