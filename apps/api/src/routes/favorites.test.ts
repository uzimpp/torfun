import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE, type Procurement, type User } from '@torfun/types';
import { buildApp } from '../app';
import { testEnv } from '../testing/env';
import { InMemoryFavoriteStore } from '../testing/favorite-store';
import { InMemoryProcurementStore } from '../testing/procurement-store';
import { InMemoryUserStore } from '../testing/user-store';

/**
 * Favorited TORs over HTTP, with the isolation rule as the centrepiece: two
 * officers exercising the same endpoints against the same instance must never
 * see or clear each other's saved list.
 */

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: 'project-1',
    projectName: 'โครงการพัฒนาระบบสารสนเทศ',
    deptName: 'หน่วยงานรัฐ',
    deptSubName: null,
    registryName: 'หน่วยงานรัฐ',
    deptCode: '1234567890',
    year: 2569,
    announceDate: '1 ตุลาคม 2569',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'e-bidding',
    projectMoney: 4_500_000,
    priceBuild: null,
    status: 'invitation',
    matchedKeywords: ['ระบบสารสนเทศ'],
    softwareClass: 'new_build',
    softwareScore: 8,
    eBidding: true,
    state: 'Completed',
    outcome: 'tor_analysed',
    statusHistory: [],
    zipId: 'zip-1',
    zipBytes: 100,
    archiveMemberCount: 1,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('favorite routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let users: InMemoryUserStore;
  let procurements: InMemoryProcurementStore;
  let favorites: InMemoryFavoriteStore;

  beforeEach(async () => {
    users = new InMemoryUserStore();
    procurements = new InMemoryProcurementStore();
    favorites = new InMemoryFavoriteStore();
    await procurements.upsert(procurement());
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), { procurements, favorites });
  });

  afterEach(async () => {
    await app.close();
  });

  const session = (user: User) => ({
    [ACCESS_COOKIE]: app.jwt.sign({
      user_id: user.id,
      username: user.username,
      role: user.role,
    }),
  });

  test('an anonymous caller is turned away', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/favorites' })).statusCode).toBe(401);
  });

  test('favoriting an unknown project is refused', async () => {
    const officer = users.seed({ username: 'somchai' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/favorites',
      cookies: session(officer),
      payload: { project_id: 'missing' },
    });

    expect(response.statusCode).toBe(404);
  });

  test('a favorited project appears in the officer own list, embedded with its procurement', async () => {
    const officer = users.seed({ username: 'somchai' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/favorites',
      cookies: session(officer),
      payload: { project_id: 'project-1' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      project_id: 'project-1',
      procurement: { projectName: 'โครงการพัฒนาระบบสารสนเทศ' },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/favorites',
      cookies: session(officer),
    });
    expect(list.json().favorites).toHaveLength(1);
    expect(list.json().favorites[0].project_id).toBe('project-1');
  });

  test('favoriting the same project twice does not duplicate it', async () => {
    const officer = users.seed({ username: 'somchai' });
    const favorite = () =>
      app.inject({
        method: 'POST',
        url: '/api/favorites',
        cookies: session(officer),
        payload: { project_id: 'project-1' },
      });

    await favorite();
    await favorite();

    const list = await app.inject({
      method: 'GET',
      url: '/api/favorites',
      cookies: session(officer),
    });
    expect(list.json().favorites).toHaveLength(1);
  });

  test('one officer cannot see or remove another officer favorite', async () => {
    const ours = users.seed({ username: 'somchai' });
    const theirs = users.seed({ username: 'malee' });
    await app.inject({
      method: 'POST',
      url: '/api/favorites',
      cookies: session(ours),
      payload: { project_id: 'project-1' },
    });

    const theirList = await app.inject({
      method: 'GET',
      url: '/api/favorites',
      cookies: session(theirs),
    });
    expect(theirList.json().favorites).toEqual([]);

    const theirDelete = await app.inject({
      method: 'DELETE',
      url: '/api/favorites/project-1',
      cookies: session(theirs),
    });
    expect(theirDelete.statusCode).toBe(404);

    // Nothing the other officer sent touched the record.
    expect(await favorites.find(ours.id, 'project-1')).not.toBeNull();
  });

  test('a check for an unfavorited project reads false', async () => {
    const officer = users.seed({ username: 'somchai' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/favorites/project-1',
      cookies: session(officer),
    });

    expect(response.json()).toMatchObject({ favorited: false });
  });

  test('unfavoriting removes it from the list', async () => {
    const officer = users.seed({ username: 'somchai' });
    await app.inject({
      method: 'POST',
      url: '/api/favorites',
      cookies: session(officer),
      payload: { project_id: 'project-1' },
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/favorites/project-1',
      cookies: session(officer),
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');

    const list = await app.inject({
      method: 'GET',
      url: '/api/favorites',
      cookies: session(officer),
    });
    expect(list.json().favorites).toEqual([]);
  });

  test('unfavoriting a project that was never favorited is a 404', async () => {
    const officer = users.seed({ username: 'somchai' });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/favorites/project-1',
      cookies: session(officer),
    });

    expect(response.statusCode).toBe(404);
  });
});
