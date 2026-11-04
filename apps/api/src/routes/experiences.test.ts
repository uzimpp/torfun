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
 * The work a Company has delivered, over HTTP.
 *
 * Two things are load-bearing here and are asserted on the stored record
 * rather than on the response alone: a duration is kept in whole months while
 * still reading back in the unit the officer typed, and nothing an officer
 * writes is reachable by another company.
 */

describe('experience routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let companies: InMemoryCompanyStore;
  let clients: InMemoryClientStore;
  let experiences: InMemoryExperienceStore;

  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: user.id,
      username: user.username,
      role: user.role,
    }),
  });

  /** An officer at their own company, with one client already recorded. */
  const officerWithClient = async (nameTh: string, username: string) => {
    const company = await companies.create({ nameTh, tin: null });
    const user = users.seed({ username, companyId: company.id });
    const client = await clients.create({
      companyId: company.id,
      name: 'กรมสรรพากร',
      kind: 'government',
    });
    return { user, company, client };
  };

  const addExperience = (user: User, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/experiences', cookies: session(user), payload });

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
      agencyNames: new FixedAgencyNames([]),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  test('an anonymous caller is turned away', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/experiences' })).statusCode).toBe(401);
  });

  test('a client and a project name are enough to save', async () => {
    const { user, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');

    const created = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบยื่นภาษีออนไลน์',
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      client_id: client.id,
      project_name: 'ระบบยื่นภาษีออนไลน์',
      description: null,
      tech_stack: [],
      target_platforms: [],
      duration_value: null,
      duration_unit: null,
      duration_months: null,
    });
  });

  test('two years reads back as two years and is stored as twenty four months', async () => {
    const { user, company, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');

    const created = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบสารบรรณอิเล็กทรอนิกส์',
      duration_value: 2,
      duration_unit: 'years',
    });

    expect(created.json()).toMatchObject({
      duration_value: 2,
      duration_unit: 'years',
      duration_months: 24,
    });

    // The canonical form really is months, so a later comparison against a
    // tender's timescale has one unit to work in.
    const stored = await experiences.findById(company.id, created.json().id);
    expect(stored?.durationMonths).toBe(24);
    expect(stored?.durationUnit).toBe('years');
  });

  test('a length needs both halves or neither', async () => {
    const { user, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');

    const response = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบบัญชี',
      duration_value: 6,
    });

    expect(response.statusCode).toBe(400);
  });

  test('platforms and a tech stack come back as recorded', async () => {
    const { user, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');

    const created = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบจองห้องประชุม',
      description: 'ระบบจองห้องประชุมออนไลน์สำหรับหน่วยงานราชการ',
      tech_stack: ['TypeScript', 'PostgreSQL'],
      target_platforms: ['web_app', 'mobile'],
      duration_value: 8,
      duration_unit: 'months',
    });

    expect(created.json()).toMatchObject({
      tech_stack: ['TypeScript', 'PostgreSQL'],
      target_platforms: ['web_app', 'mobile'],
      duration_value: 8,
      duration_unit: 'months',
      duration_months: 8,
    });
  });

  test('work cannot be hung off another company client', async () => {
    const ours = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const theirs = await officerWithClient('บริษัท คู่แข่ง จำกัด', 'rival');

    const response = await addExperience(ours.user, {
      client_id: theirs.client.id,
      project_name: 'ระบบที่ไม่ใช่ของเรา',
    });

    expect(response.statusCode).toBe(404);
    expect(await experiences.listByCompany(ours.company.id)).toEqual([]);
  });

  test('one company can neither read nor write another company work', async () => {
    const ours = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const theirs = await officerWithClient('บริษัท คู่แข่ง จำกัด', 'rival');

    const created = await addExperience(ours.user, {
      client_id: ours.client.id,
      project_name: 'ระบบยื่นภาษีออนไลน์',
    });
    const experienceId = created.json().id;

    const rivalList = await app.inject({
      method: 'GET',
      url: '/api/experiences',
      cookies: session(theirs.user),
    });
    expect(rivalList.json().experiences).toEqual([]);

    const rivalPatch = await app.inject({
      method: 'PATCH',
      url: `/api/experiences/${experienceId}`,
      cookies: session(theirs.user),
      payload: { project_name: 'ยึดไปแล้ว' },
    });
    expect(rivalPatch.statusCode).toBe(404);

    const rivalDelete = await app.inject({
      method: 'DELETE',
      url: `/api/experiences/${experienceId}`,
      cookies: session(theirs.user),
    });
    expect(rivalDelete.statusCode).toBe(404);

    const stored = await experiences.findById(ours.company.id, experienceId);
    expect(stored?.projectName).toBe('ระบบยื่นภาษีออนไลน์');
  });

  test('a colleague sees and can correct what was recorded', async () => {
    const { user, company, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const created = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบยื่นภาษ๊ออนไลน์',
    });

    const colleague = users.seed({ username: 'malee', companyId: company.id });
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/experiences/${created.json().id}`,
      cookies: session(colleague),
      payload: { project_name: 'ระบบยื่นภาษีออนไลน์' },
    });

    expect(patched.statusCode).toBe(200);
    expect(patched.json().project_name).toBe('ระบบยื่นภาษีออนไลน์');
  });

  test('a patch that says nothing about a duration leaves it alone', async () => {
    const { user, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const created = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบคลังสินค้า',
      duration_value: 3,
      duration_unit: 'years',
    });

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/experiences/${created.json().id}`,
      cookies: session(user),
      payload: { description: 'เพิ่มคำอธิบายภายหลัง' },
    });

    expect(patched.json()).toMatchObject({
      duration_value: 3,
      duration_unit: 'years',
      duration_months: 36,
    });
  });

  test('recording work needs a company first', async () => {
    const unaffiliated = users.seed({ username: 'unaffiliated' });

    const response = await addExperience(unaffiliated, {
      client_id: '68b1f0c2a1b2c3d4e5f60718',
      project_name: 'ระบบใด ๆ',
    });

    expect(response.statusCode).toBe(409);
  });

  test('an experience deletes', async () => {
    const { user, company, client } = await officerWithClient('บริษัท สยามซอฟต์ จำกัด', 'somchai');
    const created = await addExperience(user, {
      client_id: client.id,
      project_name: 'ระบบที่จะถูกลบ',
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/experiences/${created.json().id}`,
      cookies: session(user),
    });

    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    expect(await experiences.listByCompany(company.id)).toEqual([]);
  });
});
