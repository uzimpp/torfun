import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import type { LeaseLive } from '@torfun/types';
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

  describe('asking the holder to stop', () => {
    test('current() says who holds the lease, since when, and that nobody has asked it to stop', async () => {
      expect(await lease.current(at(0))).toBeNull();
      await lease.acquire('a', at(10), TTL);

      expect(await lease.current(at(20))).toEqual({
        holder: 'a',
        acquiredAt: at(10).toISOString(),
        stopRequestedAt: null,
        stopRequestedBy: null,
        live: null,
      });
    });

    test('an expired lease is not a Run in progress', async () => {
      await lease.acquire('a', at(0), TTL);

      expect(await lease.current(at(TTL / 1000 + 1))).toBeNull();
    });

    test('a request to stop is recorded with who made it and when, and seen by the holder', async () => {
      await lease.acquire('a', at(0), TTL);

      expect(await lease.requestStop('admin-1', at(40))).toBe(true);

      expect(await lease.stopRequested('a')).toBe(true);
      expect(await lease.current(at(41))).toMatchObject({
        stopRequestedAt: at(40).toISOString(),
        stopRequestedBy: 'admin-1',
      });
    });

    test('asking twice changes nothing: the first request stands', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.requestStop('admin-1', at(40));

      expect(await lease.requestStop('admin-2', at(50))).toBe(true);

      expect(await lease.current(at(51))).toMatchObject({
        stopRequestedAt: at(40).toISOString(),
        stopRequestedBy: 'admin-1',
      });
    });

    test('with no Run in progress there is nothing to ask', async () => {
      expect(await lease.requestStop('admin-1', at(0))).toBe(false);

      await lease.acquire('a', at(0), TTL);
      expect(await lease.requestStop('admin-1', at(TTL / 1000 + 1))).toBe(false);
    });

    test('a holder that was not asked is not told to stop', async () => {
      await lease.acquire('a', at(0), TTL);

      expect(await lease.stopRequested('a')).toBe(false);
      expect(await lease.stopRequested('someone-else')).toBe(false);
    });

    test('a request cannot leak into the next Run: releasing clears it', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.requestStop('admin-1', at(40));
      await lease.release('a');

      await lease.acquire('b', at(60), TTL);

      expect(await lease.stopRequested('b')).toBe(false);
      expect(await lease.current(at(61))).toMatchObject({ stopRequestedAt: null });
    });

    test('nor does one left on a lease that expired without being released', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.requestStop('admin-1', at(40));

      // The holder crashed; its lease lapses and another Run takes over.
      await lease.acquire('b', at(TTL / 1000 + 10), TTL);

      expect(await lease.stopRequested('b')).toBe(false);
    });
  });

  describe('what a live Run reports through its heartbeat', () => {
    const live: LeaseLive = {
      inFlight: [
        {
          slot: 1,
          projectId: '67019000001',
          projectName: 'จ้างพัฒนาระบบ',
          stage: 'download',
          fresh: true,
          since: at(25).toISOString(),
        },
      ],
      queueRemaining: 41,
      memory: {
        rssBytes: 300_000_000,
        heapUsedBytes: 120_000_000,
        peakRssBytes: 410_000_000,
        sampledAt: at(30).toISOString(),
      },
    };

    test('is read back by anyone asking for the current lease', async () => {
      await lease.acquire('a', at(0), TTL);
      expect((await lease.current(at(1)))?.live).toBeNull();

      await lease.heartbeat('a', at(30), TTL, live);

      expect((await lease.current(at(31)))?.live).toEqual(live);
    });

    test('a heartbeat with nothing to report keeps what was last reported', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.heartbeat('a', at(30), TTL, live);
      await lease.heartbeat('a', at(60), TTL);

      expect((await lease.current(at(61)))?.live).toEqual(live);
    });

    test('does not carry into the next Run', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.heartbeat('a', at(30), TTL, live);
      await lease.release('a');
      await lease.acquire('b', at(40), TTL);

      expect((await lease.current(at(41)))?.live).toBeNull();
    });

    test('nor into a Run that takes over an expired lease', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.heartbeat('a', at(30), TTL, live);
      await lease.acquire('b', at(200), TTL);

      expect((await lease.current(at(201)))?.live).toBeNull();
    });

    test('is kept as one subdocument on the lease', async () => {
      await lease.acquire('a', at(0), TTL);
      await lease.heartbeat('a', at(30), TTL, live);

      const stored = await (await getDb())
        .collection('ingestion_meta')
        .findOne({ _id: 'run_lease' as never });
      expect(Object.keys(stored ?? {}).sort()).toEqual(
        ['_id', 'acquired_at', 'expires_at', 'heartbeat_at', 'holder', 'live'].sort(),
      );
    });

    test('fields an older build left flat on the lease are not read as live', async () => {
      await lease.acquire('a', at(0), TTL);
      await (await getDb())
        .collection('ingestion_meta')
        .updateOne(
          { _id: 'run_lease' as never },
          { $set: { rss: 1, heap_used: 1, peak_rss: 1, sampled_at: at(5).toISOString() } },
        );

      expect((await lease.current(at(6)))?.live).toBeNull();
    });
  });
});
