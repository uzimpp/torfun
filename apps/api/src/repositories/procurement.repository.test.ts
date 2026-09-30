import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import type { ArchiveDocument, Procurement, ProcurementStatus, TorAnalysis } from '@torfun/types';
import { TorService } from '../services/tor.service';
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
    province: 'กรุงเทพมหานคร',
    district: 'คลองเตย',
    subdistrict: 'คลองเตย',
    registryName: 'กรุงเทพมหานคร',
    deptCode: '0100',
    year: 2568,
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 1_000_000,
    priceBuild: null,
    status: 'open',
    statusSource: 'upstream',
    upstreamStatus: 'หนังสือเชิญชวน/ประกาศเชิญชวน',
    matchedKeywords: ['จ้างพัฒนา'],
    softwareClass: 'new_build',
    softwareScore: 5,
    eBidding: true,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    statusHistory: [],
    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    archiveMembers: [],
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-09T00:00:00.000Z',
    sourceHash: null,
    lastSeenAt: null,
    changedAt: null,
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

    // The store fingerprints a record as it writes it; everything else is unchanged.
    expect(await repository.get('66059313551')).toEqual({
      ...record,
      sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
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
    const updated = await repository.transition('66059313551', 'downloading');

    const last = updated?.statusHistory.at(-1);
    expect(last).not.toHaveProperty('detail');
  });

  test('a transition derives State from Outcome, so the two cannot disagree', async () => {
    await repository.upsert(procurement());
    const expected = {
      downloading: 'Processing',
      analysing: 'Processing',
      error: 'Queued',
      not_software: 'Completed',
      no_tor_package: 'Failed',
      abandoned: 'Failed',
    } as const;

    for (const [outcome, state] of Object.entries(expected)) {
      const updated = await repository.transition('66059313551', outcome as keyof typeof expected);
      expect(updated?.state).toBe(state);
      expect(updated?.statusHistory.at(-1)).toMatchObject({ state, outcome });
    }
  });

  test('attemptsBelow leaves exhausted records out of the query, and counts a missing field as zero', async () => {
    await seed([
      procurement({ projectId: 'fresh', attempts: 0 }),
      procurement({ projectId: 'retrying', attempts: 2 }),
      procurement({ projectId: 'exhausted', attempts: 3 }),
      procurement({ projectId: 'legacy', attempts: 0 }),
    ]);
    // A record written before attempts were counted has no such field at all.
    await (
      await getDb()
    )
      .collection('procurements')
      .updateOne({ _id: 'legacy' as never }, { $unset: { attempts: '' } });

    const { items, total } = await repository.find({
      state: 'Queued',
      attemptsBelow: 3,
      limit: 50,
      offset: 0,
    });

    expect(items.map((r) => r.projectId).sort()).toEqual(['fresh', 'legacy', 'retrying']);
    expect(total).toBe(3);
  });

  test('requeueStale returns records stuck in Processing to the queue, and only those', async () => {
    const processing = (projectId: string, at: string) =>
      procurement({
        projectId,
        state: 'Processing',
        outcome: 'downloading',
        statusHistory: [{ state: 'Processing', outcome: 'downloading', at }],
      });
    await seed([
      processing('stale', '2026-09-01T00:00:00.000Z'),
      processing('fresh', '2026-09-30T12:00:00.000Z'),
      procurement({ projectId: 'queued' }),
      procurement({
        projectId: 'done',
        state: 'Completed',
        outcome: 'tor_analysed',
        statusHistory: [
          { state: 'Completed', outcome: 'tor_analysed', at: '2026-09-01T00:00:00.000Z' },
        ],
      }),
    ]);

    const count = await repository.requeueStale('2026-09-30T00:00:00.000Z');

    expect(count).toBe(1);
    const stale = await repository.get('stale');
    expect(stale?.state).toBe('Queued');
    expect(stale?.outcome).toBe('queued');
    expect(stale?.attempts).toBe(0);
    expect(stale?.statusHistory.at(-1)?.detail).toMatch(/stuck/i);
    expect((await repository.get('fresh'))?.state).toBe('Processing');
    expect((await repository.get('done'))?.state).toBe('Completed');
  });

  test('rediscovering a project does not reset a finished retrieval', async () => {
    await repository.upsert(procurement({ matchedKeywords: ['จ้างพัฒนา'] }));
    await repository.transition('66059313551', 'tor_analysed', {
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
      procurement({ projectId: 'live', status: 'open', softwareScore: 1 }),
      procurement({ projectId: 'moving', status: 'contracted', softwareScore: 9 }),
    ]);
    expect((await ids())[0]).toBe('live');

    await repository.upsert(
      procurement({
        projectId: 'moving',
        status: 'open',
        softwareScore: 9,
        projectName: 'จ้างพัฒนาระบบสารสนเทศ (แก้ไข)',
        projectMoney: 2_500_000,
      }),
    );

    const record = await repository.get('moving');
    expect(record?.status).toBe('open');
    expect(record?.projectName).toBe('จ้างพัฒนาระบบสารสนเทศ (แก้ไข)');
    expect(record?.projectMoney).toBe(2_500_000);
    // The stored rank is derived on write, so a refreshed stage has to re-sort.
    expect((await ids())[0]).toBe('moving');
  });

  test('a live tender outranks a settled contract, whatever its score', async () => {
    await seed([
      procurement({ projectId: 'settled', status: 'contracted', softwareScore: 9 }),
      procurement({ projectId: 'live', status: 'open', softwareScore: 1 }),
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
      procurement({ projectId: 'live', status: 'open' }),
      procurement({ projectId: 'settled', status: 'contracted' }),
    ]);

    expect(await ids('open')).toEqual(['live']);
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

  test('upcoming deadline windows include today and exclude past, unknown, closed and awarded records', async () => {
    const row = (id: string, deadlineAt: string | null, overrides: Partial<Procurement> = {}) =>
      procurement({ projectId: id, analysis: analysis({ deadlineAt }), ...overrides });
    await Promise.all(
      [
        row('today', '2026-10-05'),
        row('tomorrow', '2026-10-06'),
        row('three', '2026-10-08'),
        row('past', '2026-10-04'),
        row('later', '2026-10-09'),
        row('unknown', 'unreadable'),
        row('missing', null),
        row('draft', '2026-10-08', { status: 'drafting' }),
        row('cancelled', '2026-10-08', { status: 'cancelled' }),
        row('awarded', '2026-10-08', { status: 'awarded' }),
        row('winner', '2026-10-08', {
          winner: {
            name: 'ผู้ชนะ',
            taxId: '1234567890123',
            contractNo: '1',
            contractDate: null,
            contractFinishDate: null,
            priceAgree: 500000,
          },
        }),
      ].map((record) => repository.upsert(record)),
    );
    // UTC is still Oct 4; Thai officers have already reached Oct 5.
    const service = new TorService(repository, undefined, () => new Date('2026-10-04T18:00:00Z'));
    const within = await service.list({ limit: 20, offset: 0, deadlineDays: 3 }, 'admin');
    expect(within.items.map((item) => item.projectId).sort()).toEqual([
      'three',
      'today',
      'tomorrow',
    ]);
    expect(within.total).toBe(3);
    const exact = await service.list(
      {
        limit: 20,
        offset: 0,
        deadlineDays: 3,
        deadlineMode: 'exact',
      },
      'admin',
    );
    expect(exact.items.map((item) => item.projectId)).toEqual(['three']);
    const today = await service.list({ limit: 20, offset: 0, deadlineDays: 0 }, 'admin');
    expect(today.items.map((item) => item.projectId)).toEqual(['today']);
    const page = await service.list({ limit: 1, offset: 1, deadlineDays: 3 }, 'admin');
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(
      (await service.list({ limit: 20, offset: 0, deadlineDays: 3, status: 'drafting' }, 'admin'))
        .total,
    ).toBe(0);
  });

  test('deadline calendar filters include offset timestamps on the correct Thai day', async () => {
    await repository.upsert(
      procurement({
        projectId: 'thai-day',
        analysis: analysis({ deadlineAt: '2026-10-07T18:00:00Z' }),
      }),
    );
    const result = await repository.find({
      limit: 20,
      offset: 0,
      deadlineFrom: '2026-10-08',
      deadlineTo: '2026-10-08',
    });
    expect(result.items.map((item) => item.projectId)).toEqual(['thai-day']);
    expect((await repository.find({ limit: 20, offset: 0, deadlineTo: '2026-10-07' })).total).toBe(
      0,
    );
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

  test('an upper date bound alone never matches a record with no date', async () => {
    await seed([
      procurement({
        projectId: 'dated',
        announceDate: '2026-08-10',
        analysis: analysis({ deadlineAt: '2026-10-15' }),
      }),
      procurement({
        projectId: 'undated',
        announceDate: null,
        analysis: analysis({ deadlineAt: null }),
      }),
    ]);

    const published = await repository.find({ limit: 20, offset: 0, publishedTo: '2026-12-31' });
    expect(published.items.map((record) => record.projectId)).toEqual(['dated']);

    const deadline = await repository.find({ limit: 20, offset: 0, deadlineTo: '2026-12-31' });
    expect(deadline.items.map((record) => record.projectId)).toEqual(['dated']);
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

  test('filters keyword-derived industry and upstream location without regex injection', async () => {
    await seed([
      procurement({
        projectId: 'hospital',
        projectName: 'ระบบผู้ป่วย (ระยะ 2)',
        deptName: 'โรงพยาบาลกลาง',
        province: 'กรุงเทพมหานคร',
        district: 'ป้อมปราบศัตรูพ่าย',
        subdistrict: 'คลองมหานาค',
      }),
      procurement({
        projectId: 'school',
        deptName: 'โรงเรียนตัวอย่าง',
        province: 'เชียงใหม่',
        district: 'เมืองเชียงใหม่',
        subdistrict: 'สุเทพ',
      }),
    ]);

    const result = await repository.find({
      limit: 20,
      offset: 0,
      industry: 'โรงพยาบาล',
      location: 'ป้อมปราบ',
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
        province: 'กรุงเทพมหานคร',
        analysis: analysis({ targetPlatforms: ['web_app'] }),
      }),
      procurement({
        projectId: 'two',
        projectMoney: 800_000,
        announceDate: '2026-08-11',
        province: 'กรุงเทพมหานคร',
        analysis: analysis({ targetPlatforms: ['web_app'] }),
      }),
      procurement({
        projectId: 'wrong-platform',
        projectMoney: 900_000,
        announceDate: '2026-08-12',
        province: 'เชียงใหม่',
        analysis: analysis({ targetPlatforms: ['mobile'] }),
      }),
    ]);

    const page = await repository.find({
      limit: 1,
      offset: 1,
      minBudget: 500_000,
      maxBudget: 850_000,
      publishedFrom: '2026-08-01',
      deadlineTo: '2026-10-15',
      techStack: ['React', 'PostgreSQL'],
      targetPlatforms: ['web_app'],
      industry: 'จ้างพัฒนา',
      location: 'กรุงเทพ',
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

    const unfiltered = await repository.find({ limit: 20, offset: 0 });
    expect(unfiltered.total).toBe(3);
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

  test('recent returns the most recently updated procurements, newest first, up to the limit', async () => {
    await seed([
      procurement({ projectId: 'old', updatedAt: '2026-09-01T00:00:00.000Z' }),
      procurement({ projectId: 'new', updatedAt: '2026-09-30T00:00:00.000Z' }),
      procurement({ projectId: 'mid', updatedAt: '2026-09-15T00:00:00.000Z' }),
    ]);

    // `upsert` stamps updatedAt itself on a merge, but a first insert keeps the
    // value it was given, which is what orders these three.
    expect((await repository.recent(2)).map((record) => record.projectId)).toEqual(['new', 'mid']);
    expect(await repository.recent(10)).toHaveLength(3);
  });

  describe('records written before the status and outcome vocabulary changed', () => {
    // What the real database held until the migration ran: `processing` for the
    // outcome and history, the old stage names for status, and none of the newer
    // fields. Reading such a record must not fail a whole response.
    const storeLegacy = async () => {
      await repository.upsert(procurement({ projectId: 'legacy' }));
      await repository.transition('legacy', 'downloading');
      await (await getDb()).collection('procurements').updateOne(
        { _id: 'legacy' as never },
        {
          $set: {
            state: 'Processing',
            outcome: 'processing',
            'status_history.$[entry].outcome': 'processing',
            status: 'invitation',
          },
          $unset: { attempts: '', status_source: '', upstream_status: '' },
        },
        { arrayFilters: [{ 'entry.outcome': 'downloading' }] },
      );
    };

    test('are read in the new vocabulary', async () => {
      await storeLegacy();

      const record = await repository.get('legacy');

      expect(record?.outcome).toBe('downloading');
      expect(record?.status).toBe('open');
      expect(record?.statusHistory.map((entry) => entry.outcome)).toEqual(['downloading']);
      expect(record?.attempts).toBe(0);
      expect(record?.statusSource).toBeNull();
    });

    test('are counted under the new outcome in the summary', async () => {
      await storeLegacy();

      const { byOutcome } = await repository.summary();

      expect(byOutcome).toEqual({ downloading: 1 });
    });

    test('appear in a listing and in the recent list', async () => {
      await storeLegacy();

      expect((await repository.find({ limit: 10, offset: 0 })).items[0]?.outcome).toBe(
        'downloading',
      );
      expect((await repository.recent(5))[0]?.outcome).toBe('downloading');
    });
  });

  describe('upsertMany, the way a sweep writes', () => {
    const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`;

    test('inserts new records and fingerprints them', async () => {
      const summary = await repository.upsertMany([
        procurement({ projectId: 'a' }),
        procurement({ projectId: 'b' }),
      ]);

      expect(summary).toEqual({ created: 2, changed: 0, unchanged: 0 });
      expect((await repository.get('a'))?.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('a second sweep that sees the same data changes nothing, including updatedAt', async () => {
      await repository.upsertMany([
        procurement({ projectId: 'a', updatedAt: at(1) }),
        procurement({ projectId: 'b', updatedAt: at(2) }),
      ]);

      const summary = await repository.upsertMany([
        procurement({ projectId: 'a' }),
        procurement({ projectId: 'b' }),
      ]);

      expect(summary).toEqual({ created: 0, changed: 0, unchanged: 2 });
      expect((await repository.get('a'))?.updatedAt).toBe(at(1));
      expect((await repository.get('b'))?.updatedAt).toBe(at(2));
      expect((await repository.get('a'))?.lastSeenAt).not.toBeNull();
    });

    test('only the record whose data moved is changed, and it becomes the most recently updated', async () => {
      await repository.upsertMany([
        procurement({ projectId: 'a', updatedAt: at(1) }),
        procurement({ projectId: 'b', updatedAt: at(2) }),
      ]);

      const summary = await repository.upsertMany([
        procurement({ projectId: 'a', projectMoney: 9_999_999 }),
        procurement({ projectId: 'b' }),
      ]);

      expect(summary).toEqual({ created: 0, changed: 1, unchanged: 1 });
      expect((await repository.get('a'))?.changedAt).not.toBeNull();
      expect((await repository.recent(2)).map((record) => record.projectId)).toEqual(['a', 'b']);
    });

    test('a record the pipeline has worked on keeps that work when it is seen again', async () => {
      await repository.upsertMany([procurement({ projectId: 'a' })]);
      await repository.transition('a', 'no_tor_package', {}, 'no package');

      await repository.upsertMany([procurement({ projectId: 'a' })]);

      expect((await repository.get('a'))?.outcome).toBe('no_tor_package');
    });

    test('an empty sweep is a no-op', async () => {
      expect(await repository.upsertMany([])).toEqual({ created: 0, changed: 0, unchanged: 0 });
    });
  });
});
