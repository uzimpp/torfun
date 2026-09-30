import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { DEFAULT_SCHEDULE } from '@torfun/types';
import { ScheduleRepository } from './schedule.repository';

/** Against a real MongoDB, in a database of its own that is dropped afterwards. */
const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_schedule_test';

const client = uri ? new MongoClient(uri) : null;
let db: Db | undefined;

const getDb = async (): Promise<Db> => {
  if (!client) throw new Error('no MongoDB configured');
  db ??= (await client.connect()).db(TEST_DB);
  return db;
};

afterAll(async () => {
  if (db) await db.dropDatabase();
  await client?.close();
});

const describeMongo = uri ? describe : describe.skip;

const setting = { enabled: true, mode: 'interval', timeOfDay: '03:30', everyHours: 12 } as const;

describeMongo('ScheduleRepository', () => {
  let repository: ScheduleRepository;

  beforeEach(async () => {
    repository = new ScheduleRepository(getDb);
    await (await getDb()).collection('ingestion_meta').deleteMany({ _id: 'schedule' as never });
  });

  test('before anyone has saved one, the schedule is the default: off', async () => {
    expect(await repository.get()).toEqual({ schedule: DEFAULT_SCHEDULE, lastRunStartedAt: null });
  });

  test('a saved schedule round-trips with who saved it and when', async () => {
    const saved = await repository.save(setting, 'admin-1', '2026-10-01T05:00:00.000Z');

    expect(saved).toEqual({
      ...setting,
      updatedAt: '2026-10-01T05:00:00.000Z',
      updatedBy: 'admin-1',
    });
    expect((await repository.get()).schedule).toEqual(saved);
  });

  test('saving again replaces the setting', async () => {
    await repository.save(setting, 'admin-1', '2026-10-01T05:00:00.000Z');
    await repository.save({ ...setting, enabled: false }, 'admin-2', '2026-10-02T05:00:00.000Z');

    const { schedule } = await repository.get();
    expect(schedule.enabled).toBe(false);
    expect(schedule.updatedBy).toBe('admin-2');
  });

  test('recording a run start leaves the schedule as it was — off, if nobody enabled it', async () => {
    await repository.markRunStarted('2026-10-01T19:00:00.000Z');

    expect(await repository.get()).toEqual({
      schedule: DEFAULT_SCHEDULE,
      lastRunStartedAt: '2026-10-01T19:00:00.000Z',
    });
  });

  test('recording a run start does not disturb a saved schedule, nor saving the last run', async () => {
    const saved = await repository.save(setting, 'admin-1', '2026-10-01T05:00:00.000Z');
    await repository.markRunStarted('2026-10-01T19:00:00.000Z');
    expect(await repository.get()).toEqual({
      schedule: saved,
      lastRunStartedAt: '2026-10-01T19:00:00.000Z',
    });

    await repository.save({ ...setting, everyHours: 24 }, 'admin-1', '2026-10-02T05:00:00.000Z');
    expect((await repository.get()).lastRunStartedAt).toBe('2026-10-01T19:00:00.000Z');
  });
});
