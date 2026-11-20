import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { MongoClient, type Db } from 'mongodb';
import { CompanyRepository } from './company.repository';
import { UserRepository } from './user.repository';

/**
 * The queries behind join approval (pentest P-1), against a real MongoDB: the
 * in-memory stores imitate them, but whether a conditional update really is
 * conditional, and whether `$addToSet`/`$pull` keep the manager list tidy, is
 * only true of the database.
 *
 * A database of its own, dropped afterwards. Skipped when no MongoDB is set.
 */
const uri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;
const TEST_DB = 'torfun_company_membership_test';

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

describeMongo('company membership storage', () => {
  let companies: CompanyRepository;
  let users: UserRepository;

  const officer = (username: string) =>
    users.create({
      username,
      firstName: 'Somchai',
      lastName: 'Prasert',
      role: 'business_development_officer',
    });

  beforeEach(async () => {
    companies = new CompanyRepository(getDb);
    users = new UserRepository(getDb);
    const database = await getDb();
    await Promise.all(
      ['companies', 'users'].map((name) => database.collection(name).deleteMany({})),
    );
  });

  test('a new company reads back with its creator as manager and approval off', async () => {
    const creator = await officer('creator');
    const company = await companies.create({
      nameTh: 'บริษัท สยามซอฟต์ จำกัด',
      tin: null,
      managerIds: [creator.id],
    });

    expect(await companies.findById(company.id)).toMatchObject({
      managerIds: [creator.id],
      autoApproveDomain: null,
    });
  });

  test('a company stored before managers existed reads back with none', async () => {
    const { insertedId } = await (await getDb()).collection('companies').insertOne({
      name_th: 'บริษัท เก่า จำกัด',
      tin: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    expect(await companies.findById(insertedId.toString())).toMatchObject({
      managerIds: [],
      autoApproveDomain: null,
    });
  });

  test('promoting twice keeps one entry, and stepping down removes it', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    await companies.setManager(company.id, 'u1', true);
    await companies.setManager(company.id, 'u1', true);
    expect((await companies.findById(company.id))?.managerIds).toEqual(['u1']);
    await companies.setManager(company.id, 'u1', false);
    expect((await companies.findById(company.id))?.managerIds).toEqual([]);
  });

  test('a conditional step-down never removes the last manager, even when two race', async () => {
    const company = await companies.create({
      nameTh: 'บริษัท สยามซอฟต์ จำกัด',
      tin: null,
      managerIds: ['u1', 'u2'],
    });
    const results = await Promise.all([
      companies.removeManager(company.id, 'u1', { keepOne: true }),
      companies.removeManager(company.id, 'u2', { keepOne: true }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await companies.findById(company.id))?.managerIds).toHaveLength(1);

    // Not a manager: nothing to remove. Unconditionally: the last one goes too.
    expect(await companies.removeManager(company.id, 'u3', { keepOne: false })).toBe(false);
    const [last] = (await companies.findById(company.id))!.managerIds;
    expect(await companies.removeManager(company.id, last!, { keepOne: false })).toBe(true);
    expect((await companies.findById(company.id))?.managerIds).toEqual([]);
  });

  test('a Google identity is linked once and never replaced', async () => {
    const account = await officer('linked');
    expect(await users.linkGoogleId(account.id, 'first-sub')).toBe(true);
    expect(await users.linkGoogleId(account.id, 'second-sub')).toBe(false);
    expect((await users.findByGoogleId('first-sub'))?.id).toBe(account.id);
    expect(await users.findByGoogleId('second-sub')).toBeNull();
  });

  test('the auto-approve domain is stored and cleared', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    await companies.update(company.id, { autoApproveDomain: 'siamsoft.co.th' });
    expect((await companies.findById(company.id))?.autoApproveDomain).toBe('siamsoft.co.th');
    await companies.update(company.id, { autoApproveDomain: null });
    expect((await companies.findById(company.id))?.autoApproveDomain).toBeNull();
  });

  test('accepting moves the account only while the request is still on file', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const other = await companies.create({ nameTh: 'บริษัท คู่แข่ง จำกัด', tin: null });
    const applicant = await officer('applicant');

    await users.setJoinRequest(applicant.id, company.id);
    expect((await users.findById(applicant.id))?.joinRequest?.companyId).toBe(company.id);
    expect((await users.listJoinRequests(company.id)).map((user) => user.id)).toEqual([
      applicant.id,
    ]);

    // Replaced by a request elsewhere: the first company can no longer accept it.
    await users.setJoinRequest(applicant.id, other.id);
    expect(await users.acceptJoinRequest(applicant.id, company.id)).toBe(false);
    expect((await users.findById(applicant.id))?.companyId).toBeNull();

    expect(await users.acceptJoinRequest(applicant.id, other.id)).toBe(true);
    const moved = await users.findById(applicant.id);
    expect(moved?.companyId).toBe(other.id);
    expect(moved?.joinRequest).toBeNull();
    expect(await users.listJoinRequests(other.id)).toEqual([]);
  });

  test('a deactivated account cannot be accepted and is not listed', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const applicant = await officer('applicant');
    await users.setJoinRequest(applicant.id, company.id);
    await users.setActive(applicant.id, false);

    expect(await users.listJoinRequests(company.id)).toEqual([]);
    expect(await users.acceptJoinRequest(applicant.id, company.id)).toBe(false);
  });

  test('members are listed oldest first, and repointing ends a pending request', async () => {
    const company = await companies.create({ nameTh: 'บริษัท สยามซอฟต์ จำกัด', tin: null });
    const first = await officer('first');
    const second = await officer('second');
    await users.setCompanyId(second.id, company.id);
    await users.setCompanyId(first.id, company.id);

    expect((await users.listByCompany(company.id)).map((user) => user.username)).toEqual([
      'first',
      'second',
    ]);

    const leaver = await officer('leaver');
    await users.setJoinRequest(leaver.id, company.id);
    await users.setCompanyId(leaver.id, null);
    expect((await users.findById(leaver.id))?.joinRequest).toBeNull();
  });
});
