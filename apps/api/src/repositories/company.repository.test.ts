import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { CompanyRepository } from './company.repository';
import { ClientRepository } from './client.repository';
import { ExperienceRepository } from './experience.repository';

/**
 * Runs against a real MongoDB, because these are the two things an in-memory
 * store can only imitate: the company-name search, whose semantics are a Mongo
 * regex, and the company-scoped queries that keep one vendor out of another's
 * records — a filter that has to be right in the query itself, not in the
 * caller.
 *
 * It uses a database of its own and drops it afterwards. Nothing here touches
 * the collections a real ingestion run fills.
 */
const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_company_repository_test';

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

describeMongo('company-scoped repositories', () => {
  let companies: CompanyRepository;
  let clients: ClientRepository;
  let experiences: ExperienceRepository;

  beforeEach(async () => {
    companies = new CompanyRepository(getDb);
    clients = new ClientRepository(getDb);
    experiences = new ExperienceRepository(getDb);

    const database = await getDb();
    await Promise.all(
      ['companies', 'clients', 'experiences'].map((name) =>
        database.collection(name).deleteMany({}),
      ),
    );
    await Promise.all([
      companies.ensureIndexes(),
      clients.ensureIndexes(),
      experiences.ensureIndexes(),
    ]);
  });

  test('a company survives a round trip through Mongo unchanged', async () => {
    const created = await companies.create({
      nameTh: 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)',
      tin: '0107536000021',
    });

    const read = await companies.findById(created.id);

    expect(read).toEqual(created);
    // Nothing above this layer ever sees an ObjectId.
    expect(typeof read?.id).toBe('string');
  });

  test('two concurrent creates with one TIN store exactly one company', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        new CompanyRepository(getDb).create({
          nameTh: `บริษัท ทดสอบ ${i} จำกัด`,
          tin: '1112223334445',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 'rejected').every((r) => r.reason.statusCode === 409),
    ).toBe(true);
    expect(
      await (await getDb()).collection('companies').countDocuments({ tin: '1112223334445' }),
    ).toBe(1);
  });

  test('without the index (legacy duplicates), a write carrying a TIN is refused, not accepted', async () => {
    const collection = (await getDb()).collection('companies');
    await collection.dropIndex('tin_unique').catch(() => undefined);
    await collection.insertMany([
      { name_th: 'บริษัท ก จำกัด', tin: '9998887776665' },
      { name_th: 'บริษัท ก จำกัด', tin: '9998887776665' },
    ]);
    const fresh = new CompanyRepository(getDb);
    await expect(
      fresh.create({ nameTh: 'บริษัท ข จำกัด', tin: '5554443332221' }),
    ).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(await collection.countDocuments({ tin: '5554443332221' })).toBe(0);
    // A write with no TIN is unaffected.
    await expect(fresh.create({ nameTh: 'บริษัท ค จำกัด', tin: null })).resolves.toBeDefined();
    await collection.deleteMany({ tin: '9998887776665' });
    await fresh.ensureIndexes();
  });

  test('replaces qualification evidence atomically for the expected revision', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const other = await companies.create({ nameTh: 'บริษัท คู่แข่ง จำกัด', tin: null });
    expect(await companies.findQualifications(company.id)).toMatchObject({
      companyId: company.id,
      revision: null,
      certificates: [],
      personnel: [],
    });
    const input = {
      registeredCapitalThb: 100_000,
      bidBudgetMinThb: null,
      bidBudgetMaxThb: null,
      certificates: [
        { name: 'Quality', standard: 'ISO 9001', issuer: 'Issuer', validUntil: '2026-11-04' },
      ],
      personnel: [{ role: 'Developer', yearsOfExperience: 5, degree: 'BSc', certificates: null }],
    };
    const results = await Promise.all([
      companies.replaceQualifications(company.id, null, input),
      companies.replaceQualifications(company.id, null, input),
    ]);
    const saved = results.find((result) => result !== null);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(saved).toMatchObject({ companyId: company.id, ...input });
    expect(await companies.findQualifications(company.id)).toEqual(saved ?? null);
    expect(await companies.findQualifications(other.id)).toMatchObject({
      companyId: other.id,
      revision: null,
      certificates: [],
      personnel: [],
    });
  });

  test('the name search matches a substring anywhere in the name', async () => {
    await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    await companies.create({ nameTh: 'ห้างหุ้นส่วนจำกัด สยามดาต้า', tin: null });
    await companies.create({ nameTh: 'บริษัท เชียงใหม่เทค จำกัด', tin: null });

    const matches = await companies.search('สยาม', 10);

    expect(matches.map((company) => company.nameTh).sort()).toEqual([
      'บริษัท สยามซอฟต์ จำกัด',
      'ห้างหุ้นส่วนจำกัด สยามดาต้า',
    ]);
  });

  test('a search cannot smuggle a regex through the typeahead', async () => {
    await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });

    expect(await companies.search('.*', 10)).toEqual([]);
  });

  test('an unknown or malformed id is a miss rather than a crash', async () => {
    expect(await companies.findById('not-an-object-id')).toBeNull();
    expect(await companies.findById('68b1f0c2a1b2c3d4e5f60718')).toBeNull();
  });

  test('a client is unreachable from outside its own company', async () => {
    const ours = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const theirs = await companies.create({ nameTh: 'บริษัท คู่แข่ง จำกัด', tin: null });

    const mine = await clients.create({
      companyId: ours.id,
      name: 'กรมสรรพากร',
      kind: 'government',
    });

    expect(await clients.findById(theirs.id, mine.id)).toBeNull();
    expect(await clients.listByCompany(theirs.id)).toEqual([]);
    expect(await clients.update(theirs.id, mine.id, { name: 'ยึดไปแล้ว' })).toBeNull();
    expect(await clients.remove(theirs.id, mine.id)).toBe(false);

    // The scoped write from the owning company still works, so the filter is
    // doing isolation rather than blocking everything.
    expect((await clients.update(ours.id, mine.id, { name: 'กรมสรรพากรฯ' }))?.name).toBe(
      'กรมสรรพากรฯ',
    );
  });

  test('an experience is unreachable from outside its own company', async () => {
    const ours = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const theirs = await companies.create({ nameTh: 'บริษัท คู่แข่ง จำกัด', tin: null });
    const ourClient = await clients.create({
      companyId: ours.id,
      name: 'กรมสรรพากร',
      kind: 'government',
    });

    const recorded = await experiences.create({
      companyId: ours.id,
      clientId: ourClient.id,
      projectName: 'ระบบยื่นภาษีออนไลน์',
      description: null,
      techStack: ['TypeScript'],
      targetPlatforms: ['web_app'],
      durationMonths: 24,
      durationUnit: 'years',
    });

    expect(await experiences.findById(theirs.id, recorded.id)).toBeNull();
    expect(await experiences.listByCompany(theirs.id)).toEqual([]);
    expect(await experiences.remove(theirs.id, recorded.id)).toBe(false);
    // The count that guards a client deletion is scoped too, or one vendor's
    // work would keep another vendor's client alive.
    expect(await experiences.countByClient(theirs.id, ourClient.id)).toBe(0);
    expect(await experiences.countByClient(ours.id, ourClient.id)).toBe(1);
  });

  test('a stored length keeps its months and its unit', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const owner = await clients.create({
      companyId: company.id,
      name: 'กรมสรรพากร',
      kind: 'government',
    });

    const recorded = await experiences.create({
      companyId: company.id,
      clientId: owner.id,
      projectName: 'ระบบสารบรรณ',
      description: null,
      techStack: [],
      targetPlatforms: [],
      durationMonths: 24,
      durationUnit: 'years',
    });

    const read = await experiences.findById(company.id, recorded.id);

    expect(read?.durationMonths).toBe(24);
    expect(read?.durationUnit).toBe('years');
  });

  test('private name suggestions stay inside the company that recorded them', async () => {
    const ours = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const theirs = await companies.create({ nameTh: 'บริษัท คู่แข่ง จำกัด', tin: null });
    await clients.create({ companyId: theirs.id, name: 'ลูกค้าลับ', kind: 'private' });

    expect(await clients.suggestNames(ours.id, 'ลูกค้า', 10)).toEqual([]);
    expect(await clients.suggestNames(theirs.id, 'ลูกค้า', 10)).toEqual(['ลูกค้าลับ']);
  });
});
