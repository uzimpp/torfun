import { describe, expect, test } from 'vitest';
import {
  activeFilterCount,
  EMPTY_SEARCH_FILTERS,
  parseSearchFilters,
  searchHref,
  toProjectFilters,
  withoutSearchFilter,
} from './search-filter-values';

describe('province filter values', () => {
  test('a known province survives the URL round trip and reaches the API filters', () => {
    const values = parseSearchFilters({ province: 'เชียงใหม่' });
    expect(values.province).toBe('เชียงใหม่');
    expect(activeFilterCount(values)).toBe(1);
    expect(toProjectFilters(values, 20, 0)).toMatchObject({ province: 'เชียงใหม่' });
    const href = searchHref(values);
    expect(parseSearchFilters(Object.fromEntries(new URL(href, 'http://x').searchParams))).toEqual(
      values,
    );
  });

  test('an unknown province in the URL is ignored rather than sent', () => {
    const values = parseSearchFilters({ province: 'Atlantis' });
    expect(values.province).toBe('');
    expect(toProjectFilters(values, 20, 0)).not.toHaveProperty('province');
  });

  test('clearing the province chip keeps every other filter', () => {
    const values = { ...EMPTY_SEARCH_FILTERS, province: 'ภูเก็ต' as const };
    expect(withoutSearchFilter(values, 'province')).toEqual({ ...values, province: '' });
  });
});
