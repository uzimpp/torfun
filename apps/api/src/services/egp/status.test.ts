import { describe, expect, test } from 'bun:test';
import type { ProcurementStatus } from '@torfun/types';
import { isBiddable, readUpstreamStatus } from './status';

describe('readUpstreamStatus', () => {
  test('folds the e-GP stage names into the six-stage set', () => {
    const cases: Array<[string, ProcurementStatus]> = [
      ['จัดทำ TOR', 'drafting'],
      ['รายงานขอซื้อขอจ้าง', 'drafting'],
      ['หนังสือเชิญชวน/ประกาศเชิญชวน', 'open'],
      ['อนุมัติสั่งซื้อสั่งจ้างและประกาศผู้ชนะการเสนอราคา', 'awarded'],
      ['จัดทำสัญญา/บริหารสัญญา', 'contracted'],
      ['ยกเลิกโครงการ', 'cancelled'],
    ];
    for (const [raw, status] of cases) {
      expect(readUpstreamStatus(raw)).toEqual({ status, source: 'upstream' });
    }
  });

  test('the generic in-progress value the open-data feed sends is no reading at all', () => {
    // Every sampled row carries this one string; it says nothing about the
    // stage, so it must not be counted as an upstream reading.
    expect(readUpstreamStatus('ระหว่างดำเนินการ')).toEqual({ status: 'unknown', source: null });
  });

  test('tolerates the whitespace upstream actually sends', () => {
    expect(readUpstreamStatus('  จัดทำ TOR  ')).toEqual({ status: 'drafting', source: 'upstream' });
  });

  test('an unrecognised value is unknown with no source, never guessed at', () => {
    expect(readUpstreamStatus('ขั้นตอนที่ยังไม่เคยพบ')).toEqual({
      status: 'unknown',
      source: null,
    });
    expect(readUpstreamStatus(null)).toEqual({ status: 'unknown', source: null });
    expect(readUpstreamStatus('')).toEqual({ status: 'unknown', source: null });
  });
});

describe('isBiddable', () => {
  test('open is the only stage a bid is possible in', () => {
    // The whole point of typing this field: it is what puts a live tender ahead
    // of a settled contract in a run that stops early.
    expect(isBiddable('open')).toBe(true);
    for (const status of [
      'drafting',
      'evaluating',
      'awarded',
      'contracted',
      'cancelled',
      'unknown',
    ] as const) {
      expect(isBiddable(status)).toBe(false);
    }
  });
});
