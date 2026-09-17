import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import type { ArchiveDocument, Procurement, ProcurementStatus, TorAnalysis } from '@torfun/types';
import { ProcurementRepository } from './procurement.repository';

/**
 * Runs against a real MongoDB, because what these tests are for is the query
 * and sort semantics an in-memory fake would only imitate — the compound sort
 * behind the retrieval queue above all.
 *
 * It uses a database of its own and drops it afterwards. Ingested data is
 * evidence: an administrator must be able to trust that every record in the
 * real database came from a real run, so no fixture may ever land there.
 */
const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_repository_test';

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

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '66059313551',
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    registryName: 'กรุงเทพมหานคร',
    deptCode: '0100',
    year: 2568,
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 1_000_000,
    priceBuild: null,
    status: 'invitation',
    matchedKeywords: ['จ้างพัฒนา'],
    softwareClass: 'new_build',
    softwareScore: 5,
    eBidding: true,
    state: 'Queued',
    outcome: 'queued',
    statusHistory: [],
    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    ...overrides,
  };
}

const doc = (overrides: Partial<ArchiveDocument> = {}): ArchiveDocument => ({
  member: 'Attach_TOR_1.pdf',
  filename: 'Attach_TOR_1.pdf',
  bytes: 1_000,
  namePattern: 'canonical',
  role: 'main_tor',
  note: 'ขอบเขตของงาน',
  ...overrides,
});

const analysis = (overrides: Partial<TorAnalysis> = {}): TorAnalysis => ({
  summary: 'จ้างพัฒนาระบบ',
  scopeOfWork: ['พัฒนาเว็บ'],
  budgetThb: 4_500_000,
  deadlineAt: '2026-10-15',
  durationDays: 180,
  techStack: ['React', 'PostgreSQL'],
  targetPlatforms: ['web_app'],
  requiredQualifications: [],
  isSoftwareProject: true,
  confidence: 'high',
  ...overrides,
});

const describeMongo = uri ? describe : describe.skip;

describeMongo('ProcurementRepository', () => {
  let repository: ProcurementRepository;

  beforeEach(async () => {
    repository = new ProcurementRepository(getDb);
    const database = await getDb();
    await Promise.all(
      ['procurements', 'ingestion_failures', 'ingestion_meta'].map((name) =>
        database.collection(name).deleteMany({}),
      ),
    );
    await repository.ensureIndexes();
  });

  const seed = async (records: Procurement[]) => {
    for (const record of records) await repository.upsert(record);
  };
  const ids = async (status?: ProcurementStatus) =>
    (await repository.find({ limit: 50, offset: 0, ...(status ? { status } : {}) })).items.map(
      (r) => r.projectId,
    );

  test('a record survives a round trip through Mongo unchanged', async () => {
    const record = procurement({
      documents: [doc()],
      analysis: analysis({ techStack: ['React'] }),
    });
    await repository.upsert(record);

    expect(await repository.get('66059313551')).toEqual(record);
  });

  test('nothing above the repository ever sees a snake_case field or _id', async () => {
    await repository.upsert(procurement());
    const found = await repository.get('66059313551');

    expect(found).not.toHaveProperty('_id');
    expect(found).not.toHaveProperty('project_name');
    expect(found).not.toHaveProperty('biddability_rank');
    expect(found?.projectId).toBe('66059313551');
  });

  test('a transition with no detail leaves the field absent, not null', async () => {
    // The Mongo driver serialises an `undefined` object property as BSON
    // null rather than dropping the key, and StatusChangeSchema.detail is an
    // optional string that rejects null on the way back out through the API
    // — so this failing to hold is a 500 on every list of procurements that
    // includes the affected record, not just a shape mismatch in a test.
    await repository.upsert(procurement());
    const updated = await repository.transition('66059313551', 'Processing', 'processing');

    const last = updated?.statusHistory.at(-1);
    expect(last).not.toHaveProperty('detail');
  });

  test('rediscovering a project does not reset a finished retrieval', async () => {
    await repository.upsert(procurement({ matchedKeywords: ['จ้างพัฒนา'] }));
    await repository.transition('66059313551', 'Completed', 'tor_analysed', {
      documents: [doc()],
    });

    await repository.upsert(procurement({ state: 'Queued', matchedKeywords: ['ซอฟต์แวร์'] }));

    const record = await repository.get('66059313551');
    expect(record?.state).toBe('Completed');
    expect(record?.documents).toHaveLength(1);
    expect(record?.matchedKeywords.sort()).toEqual(['จ้างพัฒนา', 'ซอฟต์แวร์'].sort());
  });

  test('rediscovering a project refreshes what the agency published, and re-ranks it', async () => {
    await seed([
      procurement({ projectId: 'live', status: 'invitation', softwareScore: 1 }),
      procurement({ projectId: 'moving', status: 'contracted', softwareScore: 9 }),
    ]);
    expect((await ids())[0]).toBe('live');

    await repository.upsert(
      procurement({
        projectId: 'moving',
        status: 'invitation',
        softwareScore: 9,
        projectName: 'จ้างพัฒนาระบบสารสนเทศ (แก้ไข)',
        projectMoney: 2_500_000,
      }),
    );

    const record = await repository.get('moving');
    expect(record?.status).toBe('invitation');
    expect(record?.projectName).toBe('จ้างพัฒนาระบบสารสนเทศ (แก้ไข)');
    expect(record?.projectMoney).toBe(2_500_000);
    // The stored rank is derived on write, so a refreshed stage has to re-sort.
    expect((await ids())[0]).toBe('moving');
  });

  test('a live tender outranks a settled contract, whatever its score', async () => {
    await seed([
      procurement({ projectId: 'settled', status: 'contracted', softwareScore: 9 }),
      procurement({ projectId: 'live', status: 'invitation', softwareScore: 1 }),
    ]);

    expect((await ids())[0]).toBe('live');
  });

  test('within the same stage, software-likeness then value still decide', async () => {
    await seed([
      procurement({ projectId: 'low', softwareScore: 2, projectMoney: 9_000_000 }),
      procurement({ projectId: 'high', softwareScore: 8, projectMoney: 1_000 }),
      procurement({ projectId: 'tie', softwareScore: 8, projectMoney: 5_000_000 }),
    ]);

    expect(await ids()).toEqual(['tie', 'high', 'low']);
  });

  test('a cancelled project sinks below one whose stage is unknown', async () => {
    await seed([
      procurement({ projectId: 'cancelled', status: 'cancelled' }),
      procurement({ projectId: 'unknown', status: 'unknown' }),
    ]);

    expect(await ids()).toEqual(['unknown', 'cancelled']);
  });

  test('ordering is a priority, never a filter — nothing is hidden', async () => {
    await seed([
      procurement({ projectId: 'a', status: 'contracted' }),
      procurement({ projectId: 'b', status: 'cancelled' }),
    ]);

    expect(await ids()).toHaveLength(2);
  });

  test('callers can filter to one stage when they want to', async () => {
    await seed([
      procurement({ projectId: 'live', status: 'invitation' }),
      procurement({ projectId: 'settled', status: 'contracted' }),
    ]);

    expect(await ids('invitation')).toEqual(['live']);
  });

  test('a search term with regex characters is matched literally', async () => {
    await seed([procurement({ projectId: 'a', projectName: 'ระบบ (เฟส 2)' })]);

    const result = await repository.find({ limit: 10, offset: 0, query: '(เฟส 2)' });
    expect(result.items).toHaveLength(1);
  });

  test('filters minimum, maximum and ranged announced budgets', async () => {
    await seed([
      procurement({ projectId: 'low', projectMoney: 100_000 }),
      procurement({ projectId: 'middle', projectMoney: 500_000 }),
      procurement({ projectId: 'high', projectMoney: 1_000_000 }),
      procurement({ projectId: 'missing', projectMoney: null }),
    ]);

    expect(
      (await repository.find({ limit: 20, offset: 0, minBudget: 500_000 })).items.map(
        (record) => record.projectId,
      ),
    ).toEqual(['high', 'middle']);
    expect(
      (await repository.find({ limit: 20, offset: 0, maxBudget: 500_000 })).items.map(
        (record) => record.projectId,
      ),
    ).toEqual(['middle', 'low']);
    expect(
      (
        await repository.find({
          limit: 20,
          offset: 0,
          minBudget: 200_000,
          maxBudget: 800_000,
        })
      ).items.map((record) => record.projectId),
    ).toEqual(['middle']);
  });

  test('filters inclusive published and analysed deadline date ranges safely', async () => {
    await seed([
      procurement({
        projectId: 'inside',
        announceDate: '2026-08-10',
        analysis: analysis({ deadlineAt: '2026-10-15' }),
      }),
      procurement({
        projectId: 'outside',
        announceDate: '2026-07-31',
        analysis: analysis({ deadlineAt: '2026-11-01' }),
      }),
      procurement({ projectId: 'missing', announceDate: null, analysis: null }),
      procurement({
        projectId: 'malformed',
        announceDate: 'not-a-date',
        analysis: analysis({ deadlineAt: 'unknown' }),
      }),
    ]);

    const result = await repository.find({
      limit: 20,
      offset: 0,
      publishedFrom: '2026-08-10',
      publishedTo: '2026-08-10',
      deadlineFrom: '2026-10-15',
      deadlineTo: '2026-10-15',
    });

    expect(result.items.map((record) => record.projectId)).toEqual(['inside']);
  });

  test('requires every tech term, but any selected target platform', async () => {
    await seed([
      procurement({
        projectId: 'web',
        analysis: analysis({ techStack: ['React', 'PostgreSQL'], targetPlatforms: ['web_app'] }),
      }),
      procurement({
        projectId: 'mobile',
        analysis: analysis({ techStack: ['React Native'], targetPlatforms: ['mobile'] }),
      }),
      procurement({ projectId: 'missing', analysis: null }),
    ]);

    const tech = await repository.find({
      limit: 20,
      offset: 0,
      techStack: ['react', 'postgre'],
    });
    expect(tech.items.map((record) => record.projectId)).toEqual(['web']);

    const platforms = await repository.find({
      limit: 20,
      offset: 0,
      targetPlatforms: ['web_app', 'mobile'],
    });
    expect(platforms.items.map((record) => record.projectId).sort()).toEqual(['mobile', 'web']);
  });

  test('filters procurement method and keyword-derived industry without regex injection', async () => {
    await seed([
      procurement({
        projectId: 'hospital',
        projectName: 'ระบบผู้ป่วย (ระยะ 2)',
        deptName: 'โรงพยาบาลกลาง',
        purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      }),
      procurement({
        projectId: 'school',
        deptName: 'โรงเรียนตัวอย่าง',
        purchaseMethodName: 'วิธีเฉพาะเจาะจง',
      }),
    ]);

    const result = await repository.find({
      limit: 20,
      offset: 0,
      industry: 'โรงพยาบาล',
      purchaseMethod: 'e-bidding',
      query: '(ระยะ 2)',
    });
    expect(result.items.map((record) => record.projectId)).toEqual(['hospital']);
  });

  test('combines filters, reports zero matches, and paginates the filtered total', async () => {
    await seed([
      procurement({
        projectId: 'one',
        projectMoney: 700_000,
        announceDate: '2026-08-10',
        purchaseMethodName: 'e-bidding',
        analysis: analysis({ targetPlatforms: ['web_app'] }),
      }),
      procurement({
        projectId: 'two',
        projectMoney: 800_000,
        announceDate: '2026-08-11',
        purchaseMethodName: 'e-bidding',
        analysis: analysis({ targetPlatforms: ['web_app'] }),
      }),
      procurement({
        projectId: 'wrong-platform',
        projectMoney: 900_000,
        announceDate: '2026-08-12',
        purchaseMethodName: 'e-bidding',
        analysis: analysis({ targetPlatforms: ['mobile'] }),
      }),
    ]);

    const page = await repository.find({
      limit: 1,
      offset: 1,
      minBudget: 500_000,
      maxBudget: 850_000,
      publishedFrom: '2026-08-01',
      techStack: ['React', 'PostgreSQL'],
      targetPlatforms: ['web_app'],
      purchaseMethod: 'e-bidding',
    });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);

    const none = await repository.find({
      limit: 20,
      offset: 0,
      minBudget: 2_000_000,
      targetPlatforms: ['macos'],
    });
    expect(none).toEqual({ items: [], total: 0 });
  });

  test('summary counts only documents that turned out to be TORs', async () => {
    await seed([
      procurement({
        documents: [
          doc({ bytes: 2_000, role: 'main_tor' }),
          doc({ member: 'b', filename: 'ร่างTOR.pdf', bytes: 1_000, role: 'tor_variant' }),
          doc({ member: 'c', filename: 'CONTRACTOR.pdf', bytes: 500_000, role: 'not_tor' }),
        ],
      }),
    ]);

    const summary = await repository.summary();
    expect(summary.torDocumentsRetrieved).toBe(2);
    expect(summary.totalTorBytes).toBe(3_000);
    expect(summary.byState.Queued).toBe(1);
  });

  test('failures and the last run time survive a restart', async () => {
    await repository.recordFailures([
      {
        projectId: '1',
        projectName: 'x',
        stage: 'download',
        error: 'connection reset',
        at: '2026-09-09T00:00:00.000Z',
      },
    ]);
    await repository.markRun('2026-09-09T01:00:00.000Z');

    const fresh = new ProcurementRepository(getDb);
    expect(await fresh.listFailures()).toHaveLength(1);
    expect((await fresh.summary()).lastRunAt).toBe('2026-09-09T01:00:00.000Z');
  });
});
