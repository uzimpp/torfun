import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { ContractEnrichmentRepository } from './contract-enrichment.repository';

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

describeMongo('ContractEnrichmentRepository', () => {
  let repository: ContractEnrichmentRepository;

  beforeEach(async () => {
    repository = new ContractEnrichmentRepository(getDb);

    const database = await getDb();
    await database.collection('contract_enrichments').deleteMany({});
  });

  afterAll(async () => {
    await client?.close();
  });

  test('claims a pending submissions task', async () => {
    const claimToken = await repository.claim(
      'project-001',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    expect(claimToken).toBeString();
    expect(claimToken).not.toBe('');

    const document = await (
      await getDb()
    )
      .collection<{
        _id: string;
        contract_year: number;
        submissions: {
          status: string;
          attempts: number;
          claim_token: string | null;
        };
      }>('contract_enrichments')
      .findOne({ _id: 'project-001:2569' });

    expect(document?.contract_year).toBe(2569);
    expect(document?.submissions.status).toBe('processing');
    expect(document?.submissions.attempts).toBe(1);
    expect(document?.submissions.claim_token).toBe(claimToken);
  });

  test('does not claim a task that is already processing with an active lease', async () => {
    const firstClaim = await repository.claim(
      'project-002',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    const secondClaim = await repository.claim(
      'project-002',
      2569,
      'submissions',
      '2026-11-15T10:01:00.000Z',
      '2026-11-15T10:06:00.000Z',
    );

    expect(firstClaim).toBeString();
    expect(secondClaim).toBeNull();
  });

  test('reclaims a task when its processing lease expires', async () => {
    const firstClaim = await repository.claim(
      'project-003',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    const secondClaim = await repository.claim(
      'project-003',
      2569,
      'submissions',
      '2026-11-15T10:06:00.000Z',
      '2026-11-15T10:11:00.000Z',
    );

    expect(firstClaim).toBeString();
    expect(secondClaim).toBeString();
    expect(secondClaim).not.toBe(firstClaim);
  });

  test('keeps a renewed project-year task lease owned by its worker', async () => {
    const claimToken = await repository.claim(
      'project-renewal',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );
    if (!claimToken) throw new Error('Expected to claim the enrichment task');

    expect(
      await repository.renew(
        'project-renewal',
        2569,
        'submissions',
        claimToken,
        '2026-11-15T10:10:00.000Z',
        '2026-11-15T10:04:00.000Z',
      ),
    ).toBe(true);

    const nextClaim = await repository.claim(
      'project-renewal',
      2569,
      'submissions',
      '2026-11-15T10:06:00.000Z',
      '2026-11-15T10:11:00.000Z',
    );
    expect(nextClaim).toBeNull();
  });

  test('tracks enrichment independently for the same project in different years', async () => {
    const claim2568 = await repository.claim(
      'project-years',
      2568,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );
    const claim2569 = await repository.claim(
      'project-years',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    expect(claim2568).toBeString();
    expect(claim2569).toBeString();
    expect(claim2569).not.toBe(claim2568);
  });

  test('marks a claimed task as completed', async () => {
    const claimToken = await repository.claim(
      'project-004',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    if (!claimToken) throw new Error('Expected a claim token');

    await repository.markCompleted(
      'project-004',
      2569,
      'submissions',
      claimToken,
      '2026-11-15T10:01:00.000Z',
    );

    const document = await (
      await getDb()
    )
      .collection<{
        _id: string;
        submissions: {
          status: string;
          lease_until: string | null;
          claim_token: string | null;
        };
      }>('contract_enrichments')
      .findOne({ _id: 'project-004:2569' });

    expect(document?.submissions.status).toBe('completed');
    expect(document?.submissions.lease_until).toBeNull();
    expect(document?.submissions.claim_token).toBeNull();
  });

  test('marks a claimed task as failed', async () => {
    const claimToken = await repository.claim(
      'project-005',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    if (!claimToken) throw new Error('Expected a claim token');

    await repository.markFailed('project-005', 2569, 'submissions', claimToken, {
      at: '2026-11-15T10:01:00.000Z',
      retryAt: '2026-11-15T10:10:00.000Z',
      error: 'API request failed',
    });

    const document = await (
      await getDb()
    )
      .collection<{
        _id: string;
        submissions: {
          status: string;
          lease_until: string | null;
          next_attempt_at: string | null;
          last_error: string | null;
          claim_token: string | null;
        };
      }>('contract_enrichments')
      .findOne({ _id: 'project-005:2569' });

    expect(document?.submissions.status).toBe('failed');
    expect(document?.submissions.lease_until).toBeNull();
    expect(document?.submissions.next_attempt_at).toBe('2026-11-15T10:10:00.000Z');
    expect(document?.submissions.last_error).toBe('API request failed');
    expect(document?.submissions.claim_token).toBeNull();
  });

  test('rejects a stale worker after another worker reclaims the task', async () => {
    const firstClaim = await repository.claim(
      'project-006',
      2569,
      'submissions',
      '2026-11-15T10:00:00.000Z',
      '2026-11-15T10:05:00.000Z',
    );

    const secondClaim = await repository.claim(
      'project-006',
      2569,
      'submissions',
      '2026-11-15T10:06:00.000Z',
      '2026-11-15T10:11:00.000Z',
    );

    if (!firstClaim || !secondClaim) {
      throw new Error('Expected both workers to receive claim tokens');
    }

    await expect(
      repository.markCompleted(
        'project-006',
        2569,
        'submissions',
        firstClaim,
        '2026-11-15T10:07:00.000Z',
      ),
    ).rejects.toThrow('Enrichment claim is no longer owned by this worker');

    const document = await (
      await getDb()
    )
      .collection<{
        _id: string;
        submissions: {
          status: string;
          claim_token: string | null;
        };
      }>('contract_enrichments')
      .findOne({ _id: 'project-006:2569' });

    expect(document?.submissions.status).toBe('processing');
    expect(document?.submissions.claim_token).toBe(secondClaim);
  });

  test('allows only one worker to claim a new project concurrently', async () => {
    const results = await Promise.all([
      repository.claim(
        'project-007',
        2569,
        'submissions',
        '2026-11-15T10:00:00.000Z',
        '2026-11-15T10:05:00.000Z',
      ),
      repository.claim(
        'project-007',
        2569,
        'submissions',
        '2026-11-15T10:00:00.000Z',
        '2026-11-15T10:05:00.000Z',
      ),
    ]);

    expect(results.filter((token) => token !== null)).toHaveLength(1);
    expect(results.filter((token) => token === null)).toHaveLength(1);
  });
});
