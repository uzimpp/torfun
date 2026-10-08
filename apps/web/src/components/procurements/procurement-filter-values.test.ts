import { describe, expect, test } from 'vitest';
import {
  EMPTY_PROCUREMENT_URL,
  PROCUREMENT_PAGE_SIZE,
  parseProcurementFilters,
  procurementsHref,
  toProjectQuery,
  withFilters,
  type ProcurementUrlState,
} from './procurement-filter-values';

describe('parseProcurementFilters', () => {
  test('an empty URL is the unfiltered first page of all records', () => {
    expect(parseProcurementFilters({})).toEqual(EMPTY_PROCUREMENT_URL);
    expect(EMPTY_PROCUREMENT_URL).toEqual({
      q: '',
      state: '',
      outcome: '',
      status: '',
      agency: '',
      year: '',
      page: 1,
      view: 'all',
      id: '',
    });
  });

  test('reads every key', () => {
    expect(
      parseProcurementFilters({
        q: ' ระบบ ',
        state: 'Completed',
        outcome: 'needs_review',
        status: 'open',
        agency: 'กรมบัญชีกลาง',
        year: '2568',
        page: '3',
        view: 'dropped',
        id: '66019999999',
      }),
    ).toEqual({
      q: 'ระบบ',
      state: 'Completed',
      outcome: 'needs_review',
      status: 'open',
      agency: 'กรมบัญชีกลาง',
      year: '2568',
      page: 3,
      view: 'dropped',
      id: '66019999999',
    });
  });

  test('drops values the API would refuse, so a stale bookmark still loads', () => {
    expect(
      parseProcurementFilters({
        state: 'Bogus',
        outcome: 'nope',
        status: 'whatever',
        year: '25x8',
        page: '-2',
        view: 'archive',
      }),
    ).toEqual(EMPTY_PROCUREMENT_URL);
    expect(parseProcurementFilters({ page: '1.5' }).page).toBe(1);
  });

  test('takes the first of a repeated key', () => {
    expect(parseProcurementFilters({ outcome: ['failed', 'needs_review'] }).outcome).toBe('');
    expect(parseProcurementFilters({ outcome: ['needs_review', 'error'] }).outcome).toBe(
      'needs_review',
    );
  });
});

describe('procurementsHref', () => {
  test('the defaults give the bare path', () => {
    expect(procurementsHref(EMPTY_PROCUREMENT_URL)).toBe('/admin/procurements');
  });

  test('writes only what is set, and leaves page 1 and the all view implicit', () => {
    expect(procurementsHref({ outcome: 'needs_review' })).toBe(
      '/admin/procurements?outcome=needs_review',
    );
    expect(
      procurementsHref({
        ...EMPTY_PROCUREMENT_URL,
        q: 'ระบบ งาน',
        page: 2,
        view: 'dropped',
        id: 'P1',
      }),
    ).toBe(
      '/admin/procurements?q=%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A+%E0%B8%87%E0%B8%B2%E0%B8%99&view=dropped&page=2&id=P1',
    );
  });

  test('round-trips through the parser', () => {
    const url = {
      q: 'ระบบ',
      state: 'Failed',
      outcome: 'error',
      status: 'awarded',
      agency: 'กรม ก',
      year: '2567',
      page: 4,
      view: 'all',
      id: 'X',
    } satisfies ProcurementUrlState;
    const href = procurementsHref(url);
    const params = Object.fromEntries(new URLSearchParams(href.split('?')[1]));
    expect(parseProcurementFilters(params)).toEqual(url);
  });
});

describe('withFilters', () => {
  test('a filter change goes back to page 1 and keeps the rest', () => {
    const current = { ...EMPTY_PROCUREMENT_URL, q: 'a', page: 5, id: 'P1' };
    expect(withFilters(current, { outcome: 'error' })).toEqual({
      ...current,
      outcome: 'error',
      page: 1,
    });
  });
});

describe('toProjectQuery', () => {
  test('maps set filters to the API query and the 1-based page to an offset', () => {
    expect(
      toProjectQuery(
        { ...EMPTY_PROCUREMENT_URL, q: 'x', state: 'Queued', agency: 'กรม', year: '2568' },
        3,
      ),
    ).toEqual({
      limit: PROCUREMENT_PAGE_SIZE,
      offset: 2 * PROCUREMENT_PAGE_SIZE,
      q: 'x',
      state: 'Queued',
      deptName: 'กรม',
      budgetYear: 2568,
    });
  });

  test('leaves unset filters out entirely', () => {
    expect(toProjectQuery(EMPTY_PROCUREMENT_URL, 1)).toEqual({
      limit: PROCUREMENT_PAGE_SIZE,
      offset: 0,
    });
  });
});
