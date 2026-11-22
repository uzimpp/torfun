import { describe, expect, test } from 'bun:test';
import { provinceTerms, THAI_PROVINCES } from './province';
import { ProcurementListQuerySchema } from './egp';

describe('provinces', () => {
  test('lists all 77 once', () => {
    expect(THAI_PROVINCES).toHaveLength(77);
    expect(new Set(THAI_PROVINCES).size).toBe(77);
  });

  test('Bangkok matches its short forms; ambiguous names only their formal forms', () => {
    expect(provinceTerms('กรุงเทพมหานคร')).toEqual(['กรุงเทพมหานคร', 'กรุงเทพฯ', 'กทม']);
    expect(provinceTerms('เลย')).toEqual(['จังหวัดเลย', 'จ.เลย']);
    expect(provinceTerms('เชียงใหม่')).toEqual(['เชียงใหม่']);
  });

  test('the list query accepts a known province and refuses anything else', () => {
    expect(ProcurementListQuerySchema.parse({ province: 'ภูเก็ต' }).province).toBe('ภูเก็ต');
    expect(ProcurementListQuerySchema.safeParse({ province: 'Phuket' }).success).toBe(false);
  });
});
