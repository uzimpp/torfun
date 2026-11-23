import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { GovSpendingCooldownRepository } from './govspending-cooldown.repository';

const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_govspending_cooldown_test';
const COOLDOWN_ID = 'govspending_cooldown';

const client = uri ? new MongoClient(uri) : null;
let db: Db | undefined;

const getDb = async (): Promise<Db> => {
  if (!client) throw new Error('no MongoDB configured');
  db ??= (await client.connect()).db(TEST_DB);
  return db;
};

const describeMongo = uri ? describe : describe.skip;

describeMongo('GovSpendingCooldownRepository', () => {
  let repository: GovSpendingCooldownRepository;

  beforeEach(async () => {
    repository = new GovSpendingCooldownRepository(getDb);
    await (await getDb())
      .collection<{ _id: string }>('ingestion_meta')
      .deleteOne({ _id: COOLDOWN_ID });
  });

  afterAll(async () => {
    await client?.close();
  });

  test('persists a cooldown across repository instances', async () => {
    await repository.extendCooldown('2026-11-17T10:00:00.000Z', '2026-11-16T10:00:00.000Z');

    const restartedRepository = new GovSpendingCooldownRepository(getDb);
    expect(await restartedRepository.getCooldownUntil()).toBe('2026-11-17T10:00:00.000Z');
  });

  test('extends but never shortens the stored cooldown', async () => {
    await repository.extendCooldown('2026-11-17T10:00:00.000Z', '2026-11-16T10:00:00.000Z');
    await repository.extendCooldown('2026-11-16T18:00:00.000Z', '2026-11-16T11:00:00.000Z');

    expect(await repository.getCooldownUntil()).toBe('2026-11-17T10:00:00.000Z');
  });
});
