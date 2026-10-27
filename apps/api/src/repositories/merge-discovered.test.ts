import { describe, expect, test } from 'bun:test';
import { EMPTY_STAGES, EMPTY_TIMELINE, type Procurement } from '@torfun/types';
import { mergeDiscovered } from './merge-discovered';
import { hashSource, hasUpstreamChange } from './source-hash';

function procurement(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '66059313551',
    projectName: 'จ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    deptCode: '0100',
    budgetYear: 2568,
    typeId: null,
    goodsId: null,
    detailReadAt: '2026-09-01T00:00:00.000Z',
    announceDate: '2026-08-01',
    purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    projectMoney: 1_000_000,
    priceBuild: null,
    state: 'Queued',
    outcome: 'queued',
    attempts: 0,
    holdReason: null,
    statusHistory: [],
    analysis: null,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    timeline: { ...EMPTY_TIMELINE, status: 'open' },
    approved: null,
    unpublished: null,
    archive: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const AT = '2026-09-09T12:00:00.000Z';

describe('mergeDiscovered', () => {
  test('takes the feed-owned fields from the newly discovered record', () => {
    const existing = procurement();
    const incoming = procurement({
      projectName: 'จ้างพัฒนาระบบสารสนเทศ (แก้ไข)',
      purchaseMethodName: 'วิธีเฉพาะเจาะจง',
      deptCode: '0200',
    });

    const merged = mergeDiscovered(existing, incoming, true, AT);

    expect(merged.projectName).toBe('จ้างพัฒนาระบบสารสนเทศ (แก้ไข)');
    expect(merged.purchaseMethodName).toBe('วิธีเฉพาะเจาะจง');
    expect(merged.deptCode).toBe('0200');
  });

  test('keeps what the pipeline found out, so a rediscovery cannot reset a retrieval', () => {
    const archive = {
      zipId: 'ZIP-1',
      documents: [
        {
          member: 'Attach_TOR_1.pdf',
          filename: 'Attach_TOR_1.pdf',
          bytes: 1_000,
          namePattern: 'canonical' as const,
          role: 'main_tor' as const,
          note: 'ขอบเขตของงาน',
        },
      ],
      torAmbiguous: true,
    };
    const existing = procurement({
      state: 'Completed',
      outcome: 'tor_analysed',
      statusHistory: [
        { state: 'Completed', outcome: 'tor_analysed', at: '2026-09-02T00:00:00.000Z' },
      ],
      archive,
    });

    const merged = mergeDiscovered(existing, procurement(), false, AT);

    expect(merged.state).toBe('Completed');
    expect(merged.outcome).toBe('tor_analysed');
    expect(merged.statusHistory).toEqual(existing.statusHistory);
    expect(merged.archive).toEqual(archive);
    expect(merged.discoveredAt).toBe('2026-09-01T00:00:00.000Z');
  });

  test('a rediscovery cannot wipe what the timeline said about the tender', () => {
    const timeline = {
      status: 'open' as const,
      lastReadAt: '2026-09-21T00:00:00.000Z',
      commentsCloseAt: null,
      deadlineAt: '2026-10-20T09:30:00.000Z',
      stages: { ...EMPTY_STAGES, invited: '2026-09-20T00:00:00.000Z' },
    };

    const merged = mergeDiscovered(
      procurement({ timeline }),
      procurement({ timeline: EMPTY_TIMELINE }),
      false,
      AT,
    );

    expect(merged.timeline).toEqual(timeline);
  });

  test('a rediscovery keeps who approved a held record and when', () => {
    const approved = { by: 'admin', at: '2026-09-03T00:00:00.000Z' };
    const existing = procurement({ outcome: 'tor_analysed', approved });

    expect(mergeDiscovered(existing, procurement(), false, AT).approved).toEqual(approved);
  });

  test('keeps what the project detail said, which the feed does not carry', () => {
    const existing = procurement({
      budgetYear: 2569,
      typeId: '03',
      goodsId: '4016',
      deptSubName: 'สำนักเทคโนโลยีสารสนเทศ',
      projectMoney: 23_248_000,
      priceBuild: 23_198_991,
      detailReadAt: '2026-10-08T00:00:00.000Z',
    });
    const incoming = procurement({
      budgetYear: null,
      typeId: null,
      goodsId: null,
      deptSubName: null,
      projectMoney: null,
      priceBuild: null,
      detailReadAt: null,
    });

    expect(mergeDiscovered(existing, incoming, false, AT)).toMatchObject({
      budgetYear: 2569,
      typeId: '03',
      goodsId: '4016',
      deptSubName: 'สำนักเทคโนโลยีสารสนเทศ',
      projectMoney: 23_248_000,
      priceBuild: 23_198_991,
      detailReadAt: '2026-10-08T00:00:00.000Z',
    });
  });

  test('keeps the retrieval attempt count', () => {
    const merged = mergeDiscovered(procurement({ attempts: 2 }), procurement(), false, AT);
    expect(merged.attempts).toBe(2);
  });

  test('moves updatedAt only for a change', () => {
    const existing = procurement();

    expect(mergeDiscovered(existing, procurement(), false, AT).updatedAt).toBe(existing.updatedAt);
    expect(mergeDiscovered(existing, procurement(), true, AT).updatedAt).toBe(AT);
  });
});

describe('telling a real change from a record that was only seen again', () => {
  test('nothing the feed carries changed: not a change', () => {
    const existing = procurement();

    expect(hasUpstreamChange(hashSource(existing), existing, procurement())).toBe(false);
  });

  test('a renamed project is a change', () => {
    const existing = procurement();

    expect(
      hasUpstreamChange(hashSource(existing), existing, procurement({ projectName: 'อื่น' })),
    ).toBe(true);
  });

  test('a record stored with no fingerprint is compared on its own fields, not assumed changed', () => {
    const existing = procurement();

    expect(hasUpstreamChange(null, existing, procurement())).toBe(false);
    expect(hasUpstreamChange(null, existing, procurement({ announceDate: '2026-08-02' }))).toBe(
      true,
    );
  });

  test('the fingerprint ignores what this system owns, so its own work is never mistaken for an upstream change', () => {
    const base = procurement();

    expect(hashSource({ ...base, state: 'Completed', outcome: 'tor_analysed', attempts: 2 })).toBe(
      hashSource(base),
    );
    expect(
      hashSource({
        ...base,
        timeline: { ...EMPTY_TIMELINE, status: 'drafting', lastReadAt: '2026-10-01T00:00:00.000Z' },
      }),
    ).toBe(hashSource(base));
  });

  test('the fingerprint ignores the project detail, so a sweep without it is not a change', () => {
    const base = procurement();

    expect(
      hashSource({
        ...base,
        budgetYear: 2570,
        deptSubName: 'สำนัก',
        typeId: '03',
        projectMoney: 2_000_000,
        priceBuild: 1_900_000,
      }),
    ).toBe(hashSource(base));
  });
});
