import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryIngestionLease } from '../testing/ingestion-lease';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemorySourceRegistryStore } from '../testing/source-registry-store';

/**
 * The registry decides which agencies this system asks a rate-limited upstream
 * about, so who may change it is a correctness question: administrators only.
 */
describe('source registry routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminCookie: Record<string, string>;
  let officerCookie: Record<string, string>;
  let store: InMemorySourceRegistryStore;
  let procurements: InMemoryProcurementStore;

  beforeAll(async () => {
    store = new InMemorySourceRegistryStore();
    procurements = new InMemoryProcurementStore();
    app = await buildApp(testEnv(), {
      procurements,
      ingestionLease: new InMemoryIngestionLease(),
      sourceRegistry: store,
    });
    adminCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60700',
        username: 'site-admin',
        role: 'admin',
      }),
    };
    officerCookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: '68b1f0c2a1b2c3d4e5f60718',
        username: 'bd-officer',
        role: 'business_development_officer',
      }),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    cookies?: Record<string, string>,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url: `/api/ingestion/sources${url}`,
      ...(cookies ? { cookies } : {}),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  test('an anonymous caller is turned away from every method', async () => {
    expect((await call('GET', '')).statusCode).toBe(401);
    expect((await call('POST', '', undefined, { deptId: '0999', deptName: 'x' })).statusCode).toBe(
      401,
    );
    expect((await call('PUT', '/0305', undefined, { deptName: 'x' })).statusCode).toBe(401);
    expect((await call('DELETE', '/0305')).statusCode).toBe(401);
  });

  test('a Business Development Officer may neither read nor change it', async () => {
    expect((await call('GET', '', officerCookie)).statusCode).toBe(403);
    expect(
      (await call('POST', '', officerCookie, { deptId: '0999', deptName: 'x' })).statusCode,
    ).toBe(403);
    expect((await call('PUT', '/0305', officerCookie, { deptName: 'x' })).statusCode).toBe(403);
    expect((await call('DELETE', '/0305', officerCookie)).statusCode).toBe(403);
    expect(await store.get()).toBeNull();
  });

  test('an administrator reads the shipped list', async () => {
    const response = await call('GET', '', adminCookie);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: unknown[]; isDefault: boolean };
    expect(body.isDefault).toBe(true);
    expect(body.items).toHaveLength(5);
  });

  test('add, edit and remove change the list, and name the administrator', async () => {
    const added = await call('POST', '', adminCookie, {
      deptId: '0999',
      deptName: '  หน่วยงานทดสอบ ',
    });
    expect(added.statusCode).toBe(201);
    const addedBody = added.json() as {
      items: Array<{ deptId: string; deptName: string }>;
      updatedBy: string;
    };
    expect(addedBody.items.at(-1)).toEqual({ deptId: '0999', deptName: 'หน่วยงานทดสอบ' });
    expect(addedBody.updatedBy).toBe('68b1f0c2a1b2c3d4e5f60700');

    const edited = await call('PUT', '/0999', adminCookie, { deptName: 'ชื่อใหม่' });
    expect(edited.statusCode).toBe(200);
    expect(
      (edited.json() as { items: Array<{ deptId: string; deptName: string }> }).items.at(-1)
        ?.deptName,
    ).toBe('ชื่อใหม่');

    const removed = await call('DELETE', '/0999', adminCookie);
    expect(removed.statusCode).toBe(200);
    expect(
      (removed.json() as { items: Array<{ deptId: string }> }).items.some(
        (agency) => agency.deptId === '0999',
      ),
    ).toBe(false);
  });

  test('a duplicate is 409 and an unknown id is 404', async () => {
    expect(
      (await call('POST', '', adminCookie, { deptId: '0305', deptName: 'x' })).statusCode,
    ).toBe(409);
    expect((await call('PUT', '/0001', adminCookie, { deptName: 'x' })).statusCode).toBe(404);
    expect((await call('DELETE', '/0001', adminCookie)).statusCode).toBe(404);
  });

  test('malformed input is rejected before it reaches the store', async () => {
    const bad = [
      { deptId: 'abc', deptName: 'x' },
      { deptId: '12', deptName: 'x' },
      { deptId: '0305/../x', deptName: 'x' },
      { deptId: '0999', deptName: '' },
      { deptId: '0999', deptName: 'a\u0000b' },
      { deptId: '0999', deptName: 'x'.repeat(201) },
      { deptId: '0999' },
    ];
    for (const payload of bad) {
      expect((await call('POST', '', adminCookie, payload)).statusCode).toBe(400);
    }
    expect((await call('PUT', '/not-an-id', adminCookie, { deptName: 'x' })).statusCode).toBe(400);
    expect((await call('DELETE', '/not-an-id', adminCookie)).statusCode).toBe(400);
  });

  test('removing an agency deletes no ingested record', async () => {
    const before = (await procurements.summary()).total;

    await call('DELETE', '/0305', adminCookie);

    expect((await procurements.summary()).total).toBe(before);
  });
});
