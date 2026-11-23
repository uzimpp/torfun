import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { ContractSyncRepository } from './contract-sync.repository';

const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_repository_test';

const client = uri ? new MongoClient(uri) : null;
let db: Db | undefined;

const getDb = async (): Promise<Db> => {
  if (!client) throw new Error('no MongoDB configured');
  db ??= (await client.connect()).db(TEST_DB);
  return db;
};

const describeMongo = uri ? describe : describe.skip;

describeMongo('ContractSyncRepository', () => {
  let repository: ContractSyncRepository;

  beforeEach(async () => {
    repository = new ContractSyncRepository(getDb);

    const database = await getDb();
    await database.collection('contract_syncs').deleteMany({});
  });

  afterAll(async () => {
    await client?.close();
  });

  test('claims a pending year', async () => {
    const claimToken = await repository.claim(
      2566,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );

    expect(claimToken).toBeString();
    expect(claimToken).not.toBe('');

    const document = await (
      await getDb()
    )
      .collection<{
        _id: number;
        status: string;
        attempts: number;
        claim_token: string | null;
      }>('contract_syncs')
      .findOne({ _id: 2566 });

    expect(document?.status).toBe('processing');
    expect(document?.attempts).toBe(1);
    expect(document?.claim_token).toBe(claimToken);
  });

  test('does not claim a year that is already processing with an active lease', async () => {
    const firstClaim = await repository.claim(
      2567,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );

    const secondClaim = await repository.claim(
      2567,
      '2026-11-16T10:01:00.000Z',
      '2026-11-16T10:06:00.000Z',
    );

    expect(firstClaim).toBeString();
    expect(secondClaim).toBeNull();
  });

  test('reclaims a year when its processing lease expires', async () => {
    const firstClaim = await repository.claim(
      2568,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );

    const secondClaim = await repository.claim(
      2568,
      '2026-11-16T10:06:00.000Z',
      '2026-11-16T10:11:00.000Z',
    );

    expect(firstClaim).toBeString();
    expect(secondClaim).toBeString();
    expect(secondClaim).not.toBe(firstClaim);
  });

  test('renews an active year lease before another worker can reclaim it', async () => {
    const claimToken = await repository.claim(
      2565,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );
    if (!claimToken) throw new Error('Expected to claim the fiscal year');

    expect(
      await repository.renew(
        2565,
        claimToken,
        '2026-11-16T10:10:00.000Z',
        '2026-11-16T10:04:00.000Z',
      ),
    ).toBe(true);

    const nextClaim = await repository.claim(
      2565,
      '2026-11-16T10:06:00.000Z',
      '2026-11-16T10:11:00.000Z',
    );
    expect(nextClaim).toBeNull();
  });

  test('marks a claimed year as completed', async () => {
    const claimToken = await repository.claim(
      2569,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );

    if (!claimToken) throw new Error('Expected a claim token');

    await repository.markCompleted(2569, claimToken, '2026-11-16T10:01:00.000Z');

    const document = await (
      await getDb()
    )
      .collection<{
        _id: number;
        status: string;
        lease_until: string | null;
        claim_token: string | null;
        last_synced_at: string | null;
      }>('contract_syncs')
      .findOne({ _id: 2569 });

    expect(document?.status).toBe('completed');
    expect(document?.lease_until).toBeNull();
    expect(document?.claim_token).toBeNull();
    expect(document?.last_synced_at).toBe('2026-11-16T10:01:00.000Z');
  });

  test('marks a claimed year as failed', async () => {
    const claimToken = await repository.claim(
      2570,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );

    if (!claimToken) throw new Error('Expected a claim token');

    await repository.markFailed(2570, claimToken, {
      at: '2026-11-16T10:01:00.000Z',
      retryAt: '2026-11-16T10:10:00.000Z',
      error: 'API request failed',
    });

    const document = await (
      await getDb()
    )
      .collection<{
        _id: number;
        status: string;
        lease_until: string | null;
        next_attempt_at: string | null;
        last_error: string | null;
        claim_token: string | null;
      }>('contract_syncs')
      .findOne({ _id: 2570 });

    expect(document?.status).toBe('failed');
    expect(document?.lease_until).toBeNull();
    expect(document?.next_attempt_at).toBe('2026-11-16T10:10:00.000Z');
    expect(document?.last_error).toBe('API request failed');
    expect(document?.claim_token).toBeNull();
  });

  test('rejects a stale worker after another worker reclaims the year', async () => {
    const firstClaim = await repository.claim(
      2566,
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );

    const secondClaim = await repository.claim(
      2566,
      '2026-11-16T10:06:00.000Z',
      '2026-11-16T10:11:00.000Z',
    );

    if (!firstClaim || !secondClaim) {
      throw new Error('Expected both workers to receive claim tokens');
    }

    await expect(
      repository.markCompleted(2566, firstClaim, '2026-11-16T10:07:00.000Z'),
    ).rejects.toThrow('Contract sync claim is no longer owned by this worker');

    const document = await (
      await getDb()
    )
      .collection<{
        _id: number;
        status: string;
        claim_token: string | null;
      }>('contract_syncs')
      .findOne({ _id: 2566 });

    expect(document?.status).toBe('processing');
    expect(document?.claim_token).toBe(secondClaim);
  });

  test('allows only one worker to claim a year concurrently', async () => {
    const results = await Promise.all([
      repository.claim(2567, '2026-11-16T10:00:00.000Z', '2026-11-16T10:05:00.000Z'),
      repository.claim(2567, '2026-11-16T10:00:00.000Z', '2026-11-16T10:05:00.000Z'),
    ]);

    expect(results.filter((token) => token !== null)).toHaveLength(1);
    expect(results.filter((token) => token === null)).toHaveLength(1);
  });
});
