import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { FixedAgencyNames } from '../testing/agency-names';
import { InMemoryClientStore } from '../testing/client-store';
import { InMemoryCompanyStore } from '../testing/company-store';
import { InMemoryExperienceStore } from '../testing/experience-store';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';

/**
 * Clients over HTTP, with the isolation rule as the centrepiece: two officers
 * at different software houses, exercising the same endpoints against the same
 * instance, must never see each other's customer list.
 */

const AGENCIES = ['กรุงเทพมหานคร', 'กรมสรรพากร', 'การไฟฟ้านครหลวง'];

describe('client routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let companies: InMemoryCompanyStore;
  let clients: InMemoryClientStore;
  let experiences: InMemoryExperienceStore;

  /** An officer already belonging to a company of the given name. */
  const officerAt = async (nameTh: string, username: string): Promise<User> => {
    const company = await companies.create({ nameTh, tin: null });
    return users.seed({ username, companyId: company.id });
  };

  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: user.id,
      username: user.username,
      role: user.role,
    }),
  });

  const addClient = (user: User, payload: { name: string; kind: string }) =>
    app.inject({ method: 'POST', url: '/api/clients', cookies: session(user), payload });

  beforeEach(async () => {
    users = new InMemoryUserStore();
    companies = new InMemoryCompanyStore();
    clients = new InMemoryClientStore();
    experiences = new InMemoryExperienceStore();
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      companies,
      clients,
      experiences,
      refreshTokens: new InMemoryRefreshTokenStore(),
      agencyNames: new FixedAgencyNames(AGENCIES),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  test('an anonymous caller is turned away', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/clients' })).statusCode).toBe(401);
  });

  test('a client cannot be added before a company exists', async () => {
    const officer = users.seed({ username: 'unaffiliated' });

    const response = await addClient(officer, { name: 'กรมสรรพากร', kind: 'government' });

    expect(response.statusCode).toBe(409);
    // And the list is empty rather than an error, so the page still renders.
    const list = await app.inject({
      method: 'GET',
      url: '/api/clients',
      cookies: session(officer),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().clients).toEqual([]);
  });

  test('a client is recorded with the kind the officer chose', async () => {
    const officer = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');

    const created = await addClient(officer, { name: 'กรมสรรพากร', kind: 'government' });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: 'กรมสรรพากร', kind: 'government' });
  });

  test('a colleague at the same company sees the same list', async () => {
    const officer = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    await addClient(officer, { name: 'กรมสรรพากร', kind: 'government' });

    const colleague = users.seed({ username: 'malee', companyId: officer.companyId });
    const list = await app.inject({
      method: 'GET',
      url: '/api/clients',
      cookies: session(colleague),
    });

    expect(list.json().clients).toHaveLength(1);
  });

  test('one company can neither read nor write another company clients', async () => {
    const ours = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const theirs = await officerAt('บริษัท คู่แข่ง จำกัด', 'rival');

    const created = await addClient(ours, { name: 'กรมสรรพากร', kind: 'government' });
    const clientId = created.json().id;

    const rivalList = await app.inject({
      method: 'GET',
      url: '/api/clients',
      cookies: session(theirs),
    });
    expect(rivalList.json().clients).toEqual([]);

    const rivalPatch = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${clientId}`,
      cookies: session(theirs),
      payload: { name: 'ยึดไปแล้ว' },
    });
    expect(rivalPatch.statusCode).toBe(404);

    const rivalDelete = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${clientId}`,
      cookies: session(theirs),
    });
    expect(rivalDelete.statusCode).toBe(404);

    // Nothing the rival sent touched the record.
    expect((await clients.findById(ours.companyId!, clientId))?.name).toBe('กรมสรรพากร');
  });

  test('deleting a client with work recorded against it is refused', async () => {
    const officer = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const clientId = (await addClient(officer, { name: 'กรมสรรพากร', kind: 'government' })).json()
      .id;

    await app.inject({
      method: 'POST',
      url: '/api/experiences',
      cookies: session(officer),
      payload: { client_id: clientId, project_name: 'ระบบยื่นภาษีออนไลน์' },
    });

    const refused = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${clientId}`,
      cookies: session(officer),
    });

    expect(refused.statusCode).toBe(409);
    // A refusal, not a cascade: the work is still there.
    expect(await experiences.countByClient(officer.companyId!, clientId)).toBe(1);
  });

  test('a client with nothing recorded against it deletes', async () => {
    const officer = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const clientId = (await addClient(officer, { name: 'กรมสรรพากร', kind: 'government' })).json()
      .id;

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/clients/${clientId}`,
      cookies: session(officer),
    });

    expect(deleted.statusCode).toBe(204);
    // 204 and nothing else: the web client reads the status, never a body.
    expect(deleted.body).toBe('');
    expect(await clients.findById(officer.companyId!, clientId)).toBeNull();
  });

  test('government suggestions come from the agencies already ingested', async () => {
    const officer = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');

    const response = await app.inject({
      method: 'GET',
      url: '/api/clients/suggestions?kind=government&q=กรม',
      cookies: session(officer),
    });

    expect(response.json().suggestions).toEqual(['กรมสรรพากร']);
  });

  test('private suggestions never leak another company customers', async () => {
    const ours = await officerAt('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const theirs = await officerAt('บริษัท คู่แข่ง จำกัด', 'rival');
    await addClient(theirs, { name: 'ลูกค้าลับ', kind: 'private' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/clients/suggestions?kind=private&q=ลูกค้า',
      cookies: session(ours),
    });

    expect(response.json().suggestions).toEqual([]);
  });
});
