import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryCompanyStore } from '../testing/company-store';
import { InMemoryUserStore } from '../testing/user-store';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';

/**
 * The API at its highest seam: a real Fastify instance with in-memory stores,
 * driven through `app.inject`. Everything asserted here is what a caller can
 * observe — a status code and a body — so the tests survive any rearrangement
 * of the layers underneath.
 */

const TRUE_CORP = 'บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)';
const PARTNERSHIP = 'ห้างหุ้นส่วนจำกัด สยามซอฟต์แวร์';

describe('company routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let companies: InMemoryCompanyStore;
  let officer: User;

  /** A session cookie for a seeded account, signed the way `/login` signs one. */
  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: user.id,
      username: user.username,
      role: user.role,
    }),
  });

  beforeEach(async () => {
    users = new InMemoryUserStore();
    companies = new InMemoryCompanyStore();
    // `fatal` only because a per-request log line per assertion drowns the
    // test output; the level is per-instance configuration like any other.
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      companies,
      refreshTokens: new InMemoryRefreshTokenStore(),
    });
    officer = users.seed({ username: 'somchai' });
  });

  afterEach(async () => {
    await app.close();
  });

  test('a company page is not reachable without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/companies/me' });
    expect(response.statusCode).toBe(401);
  });

  test('a Thai name with digits and brackets is accepted as typed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies: session(officer),
      payload: { name_th: TRUE_CORP, tin: '0107536000021' },
    });

    expect(response.statusCode).toBe(201);
    // The company object itself, and exactly these three fields: creating,
    // joining and correcting all answer in this one shape.
    expect(Object.keys(response.json()).sort()).toEqual(['id', 'name_th', 'tin']);
    expect(response.json()).toMatchObject({ name_th: TRUE_CORP, tin: '0107536000021' });
  });

  test('a name with no บริษัท prefix is still accepted', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies: session(officer),
      payload: { name_th: PARTNERSHIP },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().tin).toBeNull();
  });

  test('a Latin-only name is rejected', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies: session(officer),
      payload: { name_th: 'ABC Technology Co., Ltd.' },
    });

    expect(response.statusCode).toBe(400);
  });

  test('creating a company joins the caller to it', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies: session(officer),
      payload: { name_th: TRUE_CORP },
    });

    const mine = await app.inject({
      method: 'GET',
      url: '/api/companies/me',
      cookies: session(officer),
    });

    expect(mine.statusCode).toBe(200);
    expect(mine.json().name_th).toBe(TRUE_CORP);
    // The account really moved, rather than the response merely saying so.
    expect((await users.findById(officer.id))?.companyId).toBe(mine.json().id);
  });

  test('an officer with no company gets a 404 rather than an empty object', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/companies/me',
      cookies: session(officer),
    });

    expect(response.statusCode).toBe(404);
  });

  test('a colleague joins the record the first officer made', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies: session(officer),
      payload: { name_th: TRUE_CORP },
    });
    const companyId = created.json().id;

    const colleague = users.seed({ username: 'malee' });
    const search = await app.inject({
      method: 'GET',
      url: '/api/companies/search?q=ทรู',
      cookies: session(colleague),
    });
    expect(search.json().companies).toHaveLength(1);
    expect(search.json().companies[0].id).toBe(companyId);

    const joined = await app.inject({
      method: 'POST',
      url: `/api/companies/${companyId}/join`,
      cookies: session(colleague),
    });

    expect(joined.statusCode).toBe(200);
    expect(joined.json<Record<string, unknown>>()).toEqual({
      id: companyId,
      name_th: TRUE_CORP,
      tin: null,
    });
    expect((await users.findById(colleague.id))?.companyId).toBe(companyId);
  });

  test('an officer who joined the wrong company can switch', async () => {
    const wrong = await companies.create({ nameTh: PARTNERSHIP, tin: null });
    const right = await companies.create({ nameTh: TRUE_CORP, tin: null });

    await app.inject({
      method: 'POST',
      url: `/api/companies/${wrong.id}/join`,
      cookies: session(officer),
    });
    await app.inject({
      method: 'POST',
      url: `/api/companies/${right.id}/join`,
      cookies: session(officer),
    });

    const mine = await app.inject({
      method: 'GET',
      url: '/api/companies/me',
      cookies: session(officer),
    });
    expect(mine.json().name_th).toBe(TRUE_CORP);
  });

  test('joining a company that does not exist is a 404', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/companies/68b1f0c2a1b2c3d4e5f60718/join',
      cookies: session(officer),
    });

    expect(response.statusCode).toBe(404);
  });

  test('the caller can correct their own company, and only their own', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies: session(officer),
      payload: { name_th: PARTNERSHIP },
    });

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/companies/me',
      cookies: session(officer),
      payload: { name_th: TRUE_CORP },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ id: created.json().id, name_th: TRUE_CORP });

    // There is no route that takes a company id to write to, so an officer at
    // another company cannot reach this record at all.
    const outsider = users.seed({ username: 'outsider' });
    const denied = await app.inject({
      method: 'PATCH',
      url: '/api/companies/me',
      cookies: session(outsider),
      payload: { name_th: 'บริษัท ปลอม จำกัด' },
    });
    expect(denied.statusCode).toBe(404);
    expect((await companies.findById(created.json().id))?.nameTh).toBe(TRUE_CORP);
  });

  test('an empty typeahead query lists no vendors at all', async () => {
    await companies.create({ nameTh: TRUE_CORP, tin: null });

    const response = await app.inject({
      method: 'GET',
      url: '/api/companies/search?q=',
      cookies: session(officer),
    });

    expect(response.json().companies).toEqual([]);
  });
});
