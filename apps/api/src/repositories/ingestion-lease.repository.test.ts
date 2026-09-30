import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { IngestionLeaseRepository } from './ingestion-lease.repository';

/**
 * Against a real MongoDB, because what a lease promises — that two contenders
 * cannot both win — is a property of an atomic conditional write, and an
 * in-memory fake could only agree with itself. Own database, dropped afterwards.
 */
const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_lease_test';

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

const TTL = 120_000;
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, seconds));

describeMongo('IngestionLeaseRepository', () => {
  let lease: IngestionLeaseRepository;

  beforeEach(async () => {
    lease = new IngestionLeaseRepository(getDb);
    await (await getDb()).collection('ingestion_meta').deleteMany({ _id: 'run_lease' as never });
  });

  test('is free until someone takes it', async () => {
    expect(await lease.isHeld(at(0))).toBe(false);
    expect(await lease.acquire('a', at(0), TTL)).toBe(true);
    expect(await lease.isHeld(at(1))).toBe(true);
  });

  test('a second holder is refused while the first is live', async () => {
    expect(await lease.acquire('a', at(0), TTL)).toBe(true);
    expect(await lease.acquire('b', at(30), TTL)).toBe(false);
    expect(await lease.isHeld(at(31))).toBe(true);
  });

  test('exactly one of two simultaneous contenders wins', async () => {
    const results = await Promise.all([
      lease.acquire('a', at(0), TTL),
      lease.acquire('b', at(0), TTL),
      lease.acquire('c', at(0), TTL),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test('a crashed holder cannot lock the system out: an expired lease is taken over', async () => {
    expect(await lease.acquire('a', at(0), TTL)).toBe(true);

    expect(await lease.isHeld(at(121))).toBe(false);
    expect(await lease.acquire('b', at(121), TTL)).toBe(true);
    expect(await lease.isHeld(at(122))).toBe(true);
  });

  test('a heartbeat keeps the holder alive past the original expiry', async () => {
    await lease.acquire('a', at(0), TTL);

    expect(await lease.heartbeat('a', at(100), TTL)).toBe(true);
    expect(await lease.isHeld(at(200))).toBe(true); // would have expired at 120
    expect(await lease.acquire('b', at(200), TTL)).toBe(false);
  });

  test('a heartbeat from someone who does not hold it is refused', async () => {
    await lease.acquire('a', at(0), TTL);
    expect(await lease.heartbeat('b', at(10), TTL)).toBe(false);
  });

  test('a holder that lost its lease learns so from the next heartbeat', async () => {
    await lease.acquire('a', at(0), TTL);
    await lease.acquire('b', at(200), TTL); // a's lease expired, b took over

    expect(await lease.heartbeat('a', at(201), TTL)).toBe(false);
    expect(await lease.heartbeat('b', at(201), TTL)).toBe(true);
  });

  test('release frees it for the next contender', async () => {
    await lease.acquire('a', at(0), TTL);
    await lease.release('a');

    expect(await lease.isHeld(at(1))).toBe(false);
    expect(await lease.acquire('b', at(1), TTL)).toBe(true);
  });

  test('release by someone who does not hold it changes nothing', async () => {
    await lease.acquire('a', at(0), TTL);
    await lease.release('b');

    expect(await lease.isHeld(at(1))).toBe(true);
  });

  test('the holder can take it again', async () => {
    await lease.acquire('a', at(0), TTL);
    expect(await lease.acquire('a', at(10), TTL)).toBe(true);
  });
});
