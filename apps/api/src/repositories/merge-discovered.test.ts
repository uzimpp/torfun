import { describe, expect, test } from 'bun:test';
import type { Procurement } from '@torfun/types';
import { mergeDiscovered } from './merge-discovered';

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '66059313551',
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    province: 'กรุงเทพมหานคร',
    district: 'คลองเตย',
    subdistrict: 'คลองเตย',
    registryName: 'กรุงเทพมหานคร',
    deptCode: '0100',
    year: 2568,
    announceDate: '2026-08-01',
    projectTypeName: 'จ้างทำของ',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 1_000_000,
    priceBuild: null,
    status: 'open',
    statusSource: 'upstream',
    upstreamStatus: 'หนังสือเชิญชวน/ประกาศเชิญชวน',
    matchedKeywords: ['จ้างพัฒนา'],
    softwareClass: 'new_build',
    softwareScore: 5,
    eBidding: true,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    statusHistory: [],
    zipId: null,
    zipBytes: null,
    archiveMemberCount: null,
    archiveMembers: [],
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
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
      eBidding: false,
      status: 'contracted',
      softwareScore: 7,
    });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.projectName).toBe('จ้างพัฒนาระบบสารสนเทศ (แก้ไข)');
    expect(merged.projectMoney).toBe(2_500_000);
    expect(merged.priceBuild).toBe(2_400_000);
    expect(merged.purchaseMethodName).toBe('วิธีเฉพาะเจาะจง');
    expect(merged.province).toBe('เชียงใหม่');
    expect(merged.district).toBe('เมืองเชียงใหม่');
    expect(merged.subdistrict).toBe('สุเทพ');
    expect(merged.eBidding).toBe(false);
    expect(merged.status).toBe('contracted');
    expect(merged.softwareScore).toBe(7);
  });

  test('keeps what the pipeline found out, so a rediscovery cannot reset a retrieval', () => {
    const existing = procurement({
      state: 'Completed',
      outcome: 'tor_analysed',
      statusHistory: [
        { state: 'Completed', outcome: 'tor_analysed', at: '2026-09-02T00:00:00.000Z' },
      ],
      zipId: 'ZIP-1',
      zipBytes: 30_000_000,
      archiveMemberCount: 12,
      archiveMembers: [],
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
    expect(merged.zipBytes).toBe(30_000_000);
    expect(merged.archiveMemberCount).toBe(12);
    expect(merged.documents).toEqual(existing.documents);
    expect(merged.torAmbiguous).toBe(true);
    expect(merged.discoveredAt).toBe('2026-09-01T00:00:00.000Z');
  });

  test('a rediscovery that reads no stage cannot wipe a stage already read', () => {
    // The feed sends one generic value, so on every sweep it "reads" unknown.
    // Gemini's earlier reading of the documents must survive that.
    const existing = procurement({ status: 'drafting', statusSource: 'ai' });
    const incoming = procurement({
      status: 'unknown',
      statusSource: null,
      upstreamStatus: 'ระหว่างดำเนินการ',
    });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.status).toBe('drafting');
    expect(merged.statusSource).toBe('ai');
    expect(merged.upstreamStatus).toBe('ระหว่างดำเนินการ');
  });

  test('a stage the feed does name overrides an AI reading', () => {
    const existing = procurement({ status: 'drafting', statusSource: 'ai' });
    const incoming = procurement({ status: 'contracted', statusSource: 'upstream' });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.status).toBe('contracted');
    expect(merged.statusSource).toBe('upstream');
  });

  test('keeps the retrieval attempt count', () => {
    const merged = mergeDiscovered(procurement({ attempts: 2 }), procurement(), AT);
    expect(merged.attempts).toBe(2);
  });

  test('unions the keywords a project has ever matched and stamps the merge time', () => {
    const existing = procurement({ matchedKeywords: ['จ้างพัฒนา', 'ซอฟต์แวร์'] });
    const incoming = procurement({ matchedKeywords: ['ซอฟต์แวร์', 'เว็บไซต์'] });

    const merged = mergeDiscovered(existing, incoming, AT);

    expect(merged.matchedKeywords).toEqual(['จ้างพัฒนา', 'ซอฟต์แวร์', 'เว็บไซต์']);
    expect(merged.updatedAt).toBe(AT);
  });
});
