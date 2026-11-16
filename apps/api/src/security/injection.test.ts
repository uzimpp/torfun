import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ACCESS_COOKIE } from '@torfun/types';
import { buildApp } from '../app';
import { escapeRegex } from '../core/regex';
import { testEnv } from '../testing/env';
import { InMemoryCompanyStore } from '../testing/company-store';
import { InMemoryRefreshTokenStore } from '../testing/refresh-token-store';
import { InMemoryUserStore } from '../testing/user-store';
import { InMemoryProcurementStore } from '../testing/procurement-store';

/**
 * Criterion 8 (input validation, NoSQL/regex injection). ASVS V1.2.4, V1.2.9,
 * V2.2.1; threat T-07.
 */
describe('regex escaping', () => {
  const PAYLOADS = ['.*', '^admin$', '(a+)+$', 'a|b', '[a-z]{1,99999}', '\\', '$where', 'x{2}?'];

  test.each(PAYLOADS)('%s is matched literally, never as a pattern', (payload) => {
    const pattern = new RegExp(escapeRegex(payload), 'i');
    expect(pattern.test(payload)).toBe(true);
    // A live pattern like `.*` or `a|b` would match this; an escaped one must not.
    expect(pattern.test('completely unrelated company name')).toBe(false);
  });

  test('a catastrophic-backtracking payload runs in linear time once escaped', () => {
    const pattern = new RegExp(escapeRegex('(a+)+$'));
    const started = performance.now();
    pattern.test(`${'a'.repeat(50_000)}!`);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe('search inputs reach the data layer only as bounded strings', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie: Record<string, string>;
  const seen: unknown[] = [];

  beforeAll(async () => {
    const users = new InMemoryUserStore();
    const companies = new InMemoryCompanyStore();
    const original = companies.search.bind(companies);
    companies.search = async (query: string, limit: number) => {
      seen.push(query);
      return original(query, limit);
    };
    app = await buildApp(testEnv({ LOG_LEVEL: 'fatal' }), {
      users,
      companies,
      refreshTokens: new InMemoryRefreshTokenStore(),
      procurements: new InMemoryProcurementStore(),
    });
    const officer = users.seed({ username: 'searcher' });
    cookie = {
      [ACCESS_COOKIE]: app.jwt.sign({
        user_id: officer.id,
        username: officer.username,
        role: officer.role,
      }),
    };
  });
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url, cookies: cookie });

  test('operator syntax in the query string arrives as plain text, not an object', async () => {
    await get('/api/companies/search?q[$ne]=x');
    await get('/api/companies/search?q=%7B%22%24ne%22%3A1%7D'); // {"$ne":1}
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => typeof value === 'string')).toBe(true);
  });

  test('a repeated parameter (an array) is refused by validation', async () => {
    expect((await get('/api/companies/search?q=a&q=b')).statusCode).toBe(400);
    expect((await get('/api/tors?q=a&q=b')).statusCode).toBe(400);
  });

  test('over-long search terms are refused before any query runs', async () => {
    const before = seen.length;
    const long = 'a'.repeat(201);
    expect((await get(`/api/companies/search?q=${long}`)).statusCode).toBe(400);
    expect((await get(`/api/clients/suggestions?kind=government&q=${long}`)).statusCode).toBe(400);
    expect((await get(`/api/tors?q=${long}`)).statusCode).toBe(400);
    expect(seen.length).toBe(before);
  });
});
