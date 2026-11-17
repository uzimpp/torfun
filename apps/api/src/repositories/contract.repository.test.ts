import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { ContractRepository } from './contract.repository';
import { ContractSyncRepository } from './contract-sync.repository';

const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_contract_snapshot_test';

const client = uri ? new MongoClient(uri) : null;
let db: Db | undefined;

const getDb = async (): Promise<Db> => {
  if (!client) throw new Error('no MongoDB configured');
  db ??= (await client.connect()).db(TEST_DB);
  return db;
};

const describeMongo = uri ? describe : describe.skip;

describeMongo('ContractRepository', () => {
  let repository: ContractRepository;

  beforeEach(async () => {
    repository = new ContractRepository(getDb);

    const database = await getDb();
    await database.collection('contracts').deleteMany({});
    await database.collection('contract_snapshot_staging').deleteMany({});
    await database.collection('contract_syncs').deleteMany({});
  });

  afterAll(async () => {
    await client?.close();
  });

  test('returns an empty array when a project has no contracts', async () => {
    const result = await repository.listByProject('project-001');

    expect(result).toEqual([]);
  });

  test('stores contracts for a project and year', async () => {
    const contract = {
      projectId: 'project-001',
      contractYear: 2569,
      contractNo: 'CN-001',
      winnerName: 'Example Company',
      winnerTin: 'test-tin-001',
      priceAgree: 100000,
      contractDate: '2026-01-01',
      contractFinishDate: '2026-12-31',
      status: 'completed',
    };

    await repository.replaceProjectSnapshot('project-001', 2569, [contract]);

    const result = await repository.listByProject('project-001');

    expect(result).toEqual([contract]);
  });

  test('replaces the previous snapshot for the same project and year', async () => {
    const firstContract = {
      projectId: 'project-001',
      contractYear: 2569,
      contractNo: 'CN-001',
      winnerName: 'Old Company',
      winnerTin: 'test-tin-001',
      priceAgree: 100000,
      contractDate: '2026-01-01',
      contractFinishDate: '2026-12-31',
      status: 'completed',
    };

    const secondContract = {
      projectId: 'project-001',
      contractYear: 2569,
      contractNo: 'CN-002',
      winnerName: 'New Company',
      winnerTin: 'test-tin-002',
      priceAgree: 200000,
      contractDate: '2026-02-01',
      contractFinishDate: '2026-12-31',
      status: 'completed',
    };

    await repository.replaceProjectSnapshot('project-001', 2569, [firstContract]);
    await repository.replaceProjectSnapshot('project-001', 2569, [secondContract]);

    const result = await repository.listByProject('project-001');

    expect(result).toEqual([secondContract]);
  });

  test('preserves contracts from different years for the same project', async () => {
    const contract2568 = {
      projectId: 'project-001',
      contractYear: 2568,
      contractNo: 'CN-2568',
      winnerName: 'Company 2568',
      winnerTin: 'test-tin-2568',
      priceAgree: 100000,
      contractDate: '2025-01-01',
      contractFinishDate: '2025-12-31',
      status: 'completed',
    };

    const contract2569 = {
      projectId: 'project-001',
      contractYear: 2569,
      contractNo: 'CN-2569',
      winnerName: 'Company 2569',
      winnerTin: 'test-tin-2569',
      priceAgree: 200000,
      contractDate: '2026-01-01',
      contractFinishDate: '2026-12-31',
      status: 'completed',
    };

    await repository.replaceProjectSnapshot('project-001', 2568, [contract2568]);
    await repository.replaceProjectSnapshot('project-001', 2569, [contract2569]);

    const result = await repository.listByProject('project-001');

    expect(result).toHaveLength(2);
    expect(result).toContainEqual(contract2568);
    expect(result).toContainEqual(contract2569);
  });

  test('clears only the snapshot for the specified year', async () => {
    const contract2568 = {
      projectId: 'project-001',
      contractYear: 2568,
      contractNo: 'CN-2568',
      winnerName: 'Company 2568',
      winnerTin: 'test-tin-2568',
      priceAgree: 100000,
      contractDate: '2025-01-01',
      contractFinishDate: '2025-12-31',
      status: 'completed',
    };

    const contract2569 = {
      projectId: 'project-001',
      contractYear: 2569,
      contractNo: 'CN-2569',
      winnerName: 'Company 2569',
      winnerTin: 'test-tin-2569',
      priceAgree: 200000,
      contractDate: '2026-01-01',
      contractFinishDate: '2026-12-31',
      status: 'completed',
    };

    await repository.replaceProjectSnapshot('project-001', 2568, [contract2568]);
    await repository.replaceProjectSnapshot('project-001', 2569, [contract2569]);
    await repository.replaceProjectSnapshot('project-001', 2568, []);

    const result = await repository.listByProject('project-001');

    expect(result).toEqual([contract2569]);
  });

  test('keeps the previous year visible until a complete staged generation is published', async () => {
    const previous = {
      projectId: 'project-snapshot',
      contractYear: 2569,
      contractNo: 'old',
      winnerName: 'Previous winner',
      winnerTin: null,
      priceAgree: 100000,
      contractDate: null,
      contractFinishDate: null,
      status: null,
    };
    const next = { ...previous, contractNo: 'new', winnerName: 'New winner' };
    await repository.replaceProjectSnapshot('project-snapshot', 2569, [previous]);

    const generation = 'complete-generation';
    await repository.stageYearSnapshot(2569, generation, [next]);
    expect(await repository.listByYear(2569)).toEqual([previous]);

    const sync = new ContractSyncRepository(getDb);
    const claim = await sync.claim(2569, '2026-11-16T10:00:00.000Z', '2026-11-16T10:05:00.000Z');
    if (!claim) throw new Error('Expected to claim the fiscal year');
    await sync.markCompleted(2569, claim, '2026-11-16T10:01:00.000Z', generation);

    expect(await repository.listByYear(2569)).toEqual([next]);
    expect(await repository.listByProject('project-snapshot')).toEqual([next]);
  });
});
