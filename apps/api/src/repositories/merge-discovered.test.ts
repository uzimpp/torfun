import { describe, expect, test } from 'bun:test';
import type { Procurement } from '@torfun/types';
import { mergeDiscovered } from './merge-discovered';
import { hashSource } from './source-hash';

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '66059313551',
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    province: 'กรุงเทพมหานคร',
    district: 'คลองเตย',
    subdistrict: 'คลองเตย',
    deptCode: '0100',
    year: 2568,
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 1_000_000,
    priceBuild: null,
    status: 'open',
    statusSource: 'upstream',
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [],
    zipId: null,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const AT = '2026-09-09T12:00:00.000Z';

describe('mergeDiscovered', () => {
  test('takes the upstream-owned fields from the newly discovered record', () => {
    const existing = procurement();
    const incoming = procurement({
      projectName: 'จ้างพัฒนาระบบสารสนเทศ (แก้ไข)',
      projectMoney: 2_500_000,
      priceBuild: 2_400_000,
      purchaseMethodName: 'วิธีเฉพาะเจาะจง',
      province: 'เชียงใหม่',
      district: 'เมืองเชียงใหม่',
      subdistrict: 'สุเทพ',
      status: 'contracted',
    });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.projectName).toBe('จ้างพัฒนาระบบสารสนเทศ (แก้ไข)');
    expect(merged.projectMoney).toBe(2_500_000);
    expect(merged.priceBuild).toBe(2_400_000);
    expect(merged.purchaseMethodName).toBe('วิธีเฉพาะเจาะจง');
    expect(merged.province).toBe('เชียงใหม่');
    expect(merged.district).toBe('เมืองเชียงใหม่');
    expect(merged.subdistrict).toBe('สุเทพ');
    expect(merged.status).toBe('contracted');
  });

  test('keeps what the pipeline found out, so a rediscovery cannot reset a retrieval', () => {
    const existing = procurement({
      state: 'Completed',
      outcome: 'tor_analysed',
      statusHistory: [
        { state: 'Completed', outcome: 'tor_analysed', at: '2026-09-02T00:00:00.000Z' },
      ],
      zipId: 'ZIP-1',
      documents: [
        {
          member: 'Attach_TOR_1.pdf',
          filename: 'Attach_TOR_1.pdf',
          bytes: 1_000,
          namePattern: 'canonical',
          role: 'main_tor',
          note: 'ขอบเขตของงาน',
        },
      ],
      torAmbiguous: true,
    });
    const incoming = procurement({ status: 'contracted' });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.state).toBe('Completed');
    expect(merged.outcome).toBe('tor_analysed');
    expect(merged.statusHistory).toEqual(existing.statusHistory);
    expect(merged.zipId).toBe('ZIP-1');
    expect(merged.documents).toEqual(existing.documents);
    expect(merged.torAmbiguous).toBe(true);
    expect(merged.discoveredAt).toBe('2026-09-01T00:00:00.000Z');
  });

  test('a rediscovery that reads no stage cannot wipe a stage already read', () => {
    // The feed sends one generic value, so on every sweep it "reads" unknown.
    // Gemini's earlier reading of the documents must survive that.
    const existing = procurement({ status: 'drafting', statusSource: 'ai' });
    const incoming = procurement({ status: 'unknown', statusSource: null });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.status).toBe('drafting');
    expect(merged.statusSource).toBe('ai');
  });

  test('a stage the feed does name overrides an AI reading', () => {
    const existing = procurement({ status: 'drafting', statusSource: 'ai' });
    const incoming = procurement({ status: 'contracted', statusSource: 'upstream' });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.status).toBe('contracted');
    expect(merged.statusSource).toBe('upstream');
  });

  test('a rediscovery keeps who approved a held record and when', () => {
    const existing = procurement({
      outcome: 'tor_analysed',
      approvedBy: 'admin',
      approvedAt: '2026-09-03T00:00:00.000Z',
    });

    const merged = mergeDiscovered(existing, procurement(), AT);

    expect(merged.approvedBy).toBe('admin');
    expect(merged.approvedAt).toBe('2026-09-03T00:00:00.000Z');
  });

  test('keeps the retrieval attempt count', () => {
    const merged = mergeDiscovered(procurement({ attempts: 2 }), procurement(), AT);
    expect(merged.attempts).toBe(2);
  });
});

describe('telling a real change from a record that was only seen again', () => {
  const STORED = '2026-09-01T00:00:00.000Z';
  /** A stored record, as a sweep would have left it: fingerprinted and last updated at STORED. */
  const stored = (overrides: Partial<Procurement> = {}) => {
    const record = procurement({ updatedAt: STORED, ...overrides });
    return { ...record, sourceHash: hashSource(record) };
  };

  test('nothing the agency owns changed: updatedAt stays', () => {
    const existing = stored();

    const merged = mergeDiscovered(existing, procurement(), AT);

    expect(merged.updatedAt).toBe(STORED);
    expect(merged.sourceHash).toBe(existing.sourceHash);
  });

  test('a changed budget is a change: updatedAt moves, and the fingerprint follows', () => {
    const existing = stored();

    const merged = mergeDiscovered(existing, procurement({ projectMoney: 2_000_000 }), AT);

    expect(merged.updatedAt).toBe(AT);
    expect(merged.sourceHash).not.toBe(existing.sourceHash);
  });

  test('a new winner is a change', () => {
    const winner = {
      name: 'บริษัท ตัวอย่าง จำกัด',
      taxId: '0105500000001',
      contractNo: '1/2569',
      contractDate: null,
      contractFinishDate: null,
      priceAgree: 900_000,
    };

    const merged = mergeDiscovered(stored(), procurement({ winner }), AT);

    expect(merged.updatedAt).toBe(AT);
  });

  test('a record stored before fingerprints existed is compared on its own fields, not assumed changed', () => {
    const before = { ...procurement({ updatedAt: STORED }), sourceHash: null };

    const same = mergeDiscovered(before, procurement(), AT);
    const different = mergeDiscovered(before, procurement({ projectMoney: 2_000_000 }), AT);

    expect(same.updatedAt).toBe(STORED);
    expect(same.sourceHash).toBe(hashSource(procurement()));
    expect(different.updatedAt).toBe(AT);
  });

  test('the fingerprint ignores what this system owns, so its own work is never mistaken for an upstream change', () => {
    const base = procurement();

    expect(hashSource({ ...base, state: 'Completed', outcome: 'tor_analysed', attempts: 2 })).toBe(
      hashSource(base),
    );
    expect(hashSource({ ...base, status: 'drafting', statusSource: 'ai' })).toBe(hashSource(base));
  });
});
