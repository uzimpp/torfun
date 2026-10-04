import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import type { IngestionRun } from '@torfun/types';
import { IngestionRunRepository } from './ingestion-run.repository';

const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_ingestion_runs_test';

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

const run = (id: string, endedAt: string, overrides: Partial<IngestionRun> = {}): IngestionRun => ({
  id,
  startedAt: '2026-10-01T00:00:00.000Z',
  endedAt,
  durationMs: 60_000,
  trigger: 'scheduled',
  runners: 2,
  counts: {
    discovered: 10,
    newRecords: 2,
    changedRecords: 1,
    unchangedRecords: 7,
    discoverySkipped: false,
    discoveryStopped: null,
    rejectedNonRegistry: 3,
    attempted: 2,
    refreshed: 5,
    archivesRetrieved: 2,
    torAnalysed: 1,
    held: 1,
    dropped: 0,
    failed: 0,
    aborted: false,
    stopped: null,
  },
  error: null,
  tokens: { prompt: 1200, output: 300, thoughts: 90, total: 1590, calls: 3 },
  peakRssBytes: 512_000_000,
  ...overrides,
});

describeMongo('IngestionRunRepository', () => {
  let runs: IngestionRunRepository;

  beforeEach(async () => {
    runs = new IngestionRunRepository(getDb);
    await (await getDb()).collection('ingestion_runs').deleteMany({});
  });

  test('a recorded run reads back as it was written', async () => {
    const written = run('a', '2026-10-01T00:01:00.000Z');
    await runs.record(written);

    expect(await runs.recent(10)).toEqual([written]);
  });

  test('a run that threw keeps its error and no counts', async () => {
    const written = run('a', '2026-10-01T00:01:00.000Z', { counts: null, error: 'boom' });
    await runs.record(written);

    expect(await runs.recent(10)).toEqual([written]);
  });

  test('recent runs come newest first, as many as asked for', async () => {
    await runs.record(run('old', '2026-10-01T00:00:00.000Z'));
    await runs.record(run('new', '2026-10-03T00:00:00.000Z'));
    await runs.record(run('mid', '2026-10-02T00:00:00.000Z'));

    expect((await runs.recent(2)).map((entry) => entry.id)).toEqual(['new', 'mid']);
  });

  test('entries expire 90 days after they end', async () => {
    await runs.ensureIndexes();
    await runs.ensureIndexes();

    const indexes = await (await getDb()).collection('ingestion_runs').indexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { ended_at: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60 }),
    );
  });
});
