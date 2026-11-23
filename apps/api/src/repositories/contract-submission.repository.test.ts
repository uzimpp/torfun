import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { ContractSubmissionRepository } from './contract-submission.repository';
import { ContractEnrichmentRepository } from './contract-enrichment.repository';

const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_contract_submission_test';

const client = uri ? new MongoClient(uri) : null;
let db: Db | undefined;

const getDb = async (): Promise<Db> => {
  if (!client) throw new Error('no MongoDB configured');
  db ??= (await client.connect()).db(TEST_DB);
  return db;
};

const describeMongo = uri ? describe : describe.skip;

describeMongo('ContractSubmissionRepository', () => {
  let repository: ContractSubmissionRepository;

  beforeEach(async () => {
    repository = new ContractSubmissionRepository(getDb);

    const database = await getDb();
    await database.collection('contract_submissions').deleteMany({});
    await database.collection('contract_submission_staging').deleteMany({});
    await database.collection('contract_enrichments').deleteMany({});
  });

  afterAll(async () => {
    await client?.close();
  });

  test('returns an empty array when a project has no submissions', async () => {
    const result = await repository.listByProject('project-001');

    expect(result).toEqual([]);
  });

  test('stores submissions with their contract year', async () => {
    const submission = {
      projectId: 'project-001',
      contractYear: 2569,
      merchantName: 'Example Company',
      seqNo: 1,
      seqNoDesc: 'First bidder',
      submitPrice: 95000,
    };

    await repository.replaceProjectSnapshot('project-001', 2569, [submission]);

    const result = await repository.listByProject('project-001');

    expect(result).toEqual([submission]);
  });

  test('replaces the previous submission snapshot for the same year', async () => {
    const firstSubmission = {
      projectId: 'project-001',
      contractYear: 2569,
      merchantName: 'Old Company',
      seqNo: 1,
      seqNoDesc: 'First bidder',
      submitPrice: 95000,
    };

    const secondSubmission = {
      projectId: 'project-001',
      contractYear: 2569,
      merchantName: 'New Company',
      seqNo: 2,
      seqNoDesc: 'Second bidder',
      submitPrice: 90000,
    };

    await repository.replaceProjectSnapshot('project-001', 2569, [firstSubmission]);
    await repository.replaceProjectSnapshot('project-001', 2569, [secondSubmission]);

    const result = await repository.listByProject('project-001');

    expect(result).toEqual([secondSubmission]);
  });

  test('preserves submissions from different contract years', async () => {
    const submission2568 = {
      projectId: 'project-001',
      contractYear: 2568,
      merchantName: 'Company A',
      seqNo: 1,
      seqNoDesc: 'First bidder',
      submitPrice: 95000,
    };

    const submission2569 = {
      projectId: 'project-001',
      contractYear: 2569,
      merchantName: 'Company B',
      seqNo: 1,
      seqNoDesc: 'First bidder',
      submitPrice: 90000,
    };

    await repository.replaceProjectSnapshot('project-001', 2568, [submission2568]);
    await repository.replaceProjectSnapshot('project-001', 2569, [submission2569]);

    const result = await repository.listByProject('project-001');

    expect(result).toHaveLength(2);
    expect(result).toContainEqual(submission2568);
    expect(result).toContainEqual(submission2569);
  });

  test('clears only the snapshot for the specified contract year', async () => {
    const submission2568 = {
      projectId: 'project-001',
      contractYear: 2568,
      merchantName: 'Company A',
      seqNo: 1,
      seqNoDesc: 'First bidder',
      submitPrice: 95000,
    };

    const submission2569 = {
      projectId: 'project-001',
      contractYear: 2569,
      merchantName: 'Company B',
      seqNo: 1,
      seqNoDesc: 'First bidder',
      submitPrice: 90000,
    };

    await repository.replaceProjectSnapshot('project-001', 2568, [submission2568]);
    await repository.replaceProjectSnapshot('project-001', 2569, [submission2569]);
    await repository.replaceProjectSnapshot('project-001', 2568, []);

    const result = await repository.listByProject('project-001');

    expect(result).toEqual([submission2569]);
  });

  test('keeps the previous submissions visible until the complete project snapshot is published', async () => {
    const previous = {
      projectId: 'project-snapshot',
      contractYear: 2569,
      merchantName: 'Previous bidder',
      seqNo: 1,
      seqNoDesc: null,
      submitPrice: 100_000,
    };
    const next = { ...previous, merchantName: 'Current bidder', submitPrice: 90_000 };
    await repository.replaceProjectSnapshot('project-snapshot', 2569, [previous]);

    const generation = 'complete-submission-generation';
    await repository.stageProjectSnapshot('project-snapshot', 2569, generation, [next]);
    expect(await repository.listByProject('project-snapshot')).toEqual([previous]);

    const enrichment = new ContractEnrichmentRepository(getDb);
    const claim = await enrichment.claim(
      'project-snapshot',
      2569,
      'submissions',
      '2026-11-16T10:00:00.000Z',
      '2026-11-16T10:05:00.000Z',
    );
    if (!claim) throw new Error('Expected to claim project submissions');
    await enrichment.markCompleted(
      'project-snapshot',
      2569,
      'submissions',
      claim,
      '2026-11-16T10:01:00.000Z',
      generation,
    );

    expect(await repository.listByProject('project-snapshot')).toEqual([next]);
  });
});
