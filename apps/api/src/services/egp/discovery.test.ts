import { describe, expect, test } from 'bun:test';
import contractRow from './fixtures/contract-row.json';
import { toRecord, type ContractRow } from './discovery';

/**
 * Captured from one read-only `egp-contract` response on 2026-09-30. Keeping
 * the upstream snake_case fixture here makes field-name drift visible without
 * calling the government API during tests.
 */
describe('e-GP contract row mapping', () => {
  test('maps the real administrative location fields and Thai announcement date', () => {
    const row = contractRow satisfies ContractRow;
    const record = toRecord(row, 'กรุงเทพมหานคร', '3100001', 2569, 'ระบบสารสนเทศ');

    expect(record).toMatchObject({
      projectId: '68069070986',
      province: 'กรุงเทพมหานคร',
      district: 'ดินแดง',
      subdistrict: 'ดินแดง',
      announceDate: '2025-08-01T00:00:00.000Z',
    });
  });
});
