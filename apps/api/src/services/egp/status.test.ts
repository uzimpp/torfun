import { describe, expect, test } from 'bun:test';
import { isBiddable, toProcurementStatus } from './status';

describe('toProcurementStatus', () => {
  test('maps every stage of the e-GP lifecycle', () => {
    expect(toProcurementStatus('จัดทำ TOR')).toBe('drafting_tor');
    expect(toProcurementStatus('รายงานขอซื้อขอจ้าง')).toBe('requisition');
    expect(toProcurementStatus('หนังสือเชิญชวน/ประกาศเชิญชวน')).toBe('invitation');
    expect(toProcurementStatus('อนุมัติสั่งซื้อสั่งจ้างและประกาศผู้ชนะการเสนอราคา')).toBe(
      'award_announced',
    );
    expect(toProcurementStatus('จัดทำสัญญา/บริหารสัญญา')).toBe('contracted');
    expect(toProcurementStatus('ยกเลิกโครงการ')).toBe('cancelled');
  });

  test('the invitation stage is the only one open to a bid', () => {
    // The whole point of typing this field: it is what puts a live tender ahead
    // of a settled contract in a run capped at EGP_MAX_DOWNLOADS_PER_RUN.
    expect(isBiddable(toProcurementStatus('หนังสือเชิญชวน/ประกาศเชิญชวน'))).toBe(true);
    expect(isBiddable(toProcurementStatus('จัดทำสัญญา/บริหารสัญญา'))).toBe(false);
    expect(isBiddable(toProcurementStatus('ยกเลิกโครงการ'))).toBe(false);
  });

  test('tolerates the whitespace upstream actually sends', () => {
    expect(toProcurementStatus('  จัดทำ TOR  ')).toBe('drafting_tor');
  });

  test('an unrecognised stage is surfaced as unknown, never guessed at', () => {
    expect(toProcurementStatus('ขั้นตอนที่ยังไม่เคยพบ')).toBe('unknown');
    expect(toProcurementStatus(null)).toBe('unknown');
    expect(toProcurementStatus('')).toBe('unknown');
  });
});
