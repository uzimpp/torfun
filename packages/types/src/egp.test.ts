import { describe, expect, test } from 'bun:test';
import {
  IngestionOutcome,
  IngestionState,
  OUTCOME_LABELS,
  OUTCOME_STATE,
  ProcurementSchema,
  ProcurementStatus,
  STATE_LABELS,
  STATUS_LABELS,
  type Procurement,
} from './egp';

const THAI = /[฀-๿]/;

describe('ProcurementStatus', () => {
  test('is a closed set of six stages plus unknown', () => {
    const options: string[] = [...ProcurementStatus.options];
    expect(options.sort()).toEqual(
      ['awarded', 'cancelled', 'contracted', 'drafting', 'evaluating', 'open', 'unknown'].sort(),
    );
  });

  test('rejects a value outside the set', () => {
    expect(ProcurementStatus.safeParse('invitation').success).toBe(false);
    expect(ProcurementStatus.safeParse('จัดทำ TOR').success).toBe(false);
  });

  test('has a Thai label for every stage, all distinct', () => {
    const labels = ProcurementStatus.options.map((status) => STATUS_LABELS[status]);
    for (const label of labels) expect(label).toMatch(THAI);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('names the two stages a Business Development Officer acts on', () => {
    expect(STATUS_LABELS.drafting).toBe('ร่าง / เตรียมการ');
    expect(STATUS_LABELS.open).toBe('เปิดรับข้อเสนอ');
    expect(STATUS_LABELS.unknown).toBe('ยังไม่ระบุ');
  });
});

describe('IngestionState', () => {
  test('has a Thai label for every state', () => {
    for (const state of IngestionState.options) expect(STATE_LABELS[state]).toMatch(THAI);
  });
});

describe('IngestionOutcome', () => {
  test('has the ten outcomes the pipeline can reach', () => {
    const options: string[] = [...IngestionOutcome.options];
    expect(options.sort()).toEqual(
      [
        'abandoned',
        'analysing',
        'analysis_failed',
        'downloading',
        'error',
        'no_tor_in_archive',
        'no_tor_package',
        'not_software',
        'queued',
        'tor_analysed',
      ].sort(),
    );
  });

  test('has a Thai label for every outcome, all distinct', () => {
    const labels = IngestionOutcome.options.map((outcome) => OUTCOME_LABELS[outcome]);
    for (const label of labels) expect(label).toMatch(THAI);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('calls the AI step กำลังประมวลผล and the fetch step กำลังดึงข้อมูล', () => {
    expect(OUTCOME_LABELS.analysing).toBe('กำลังประมวลผล');
    expect(OUTCOME_LABELS.downloading).toBe('กำลังดึงข้อมูล');
  });

  test('every outcome belongs to exactly one state, so the two fields cannot disagree', () => {
    const outcomes: string[] = [...IngestionOutcome.options];
    expect(Object.keys(OUTCOME_STATE).sort()).toEqual(outcomes.sort());
    expect(OUTCOME_STATE.queued).toBe('Queued');
    expect(OUTCOME_STATE.error).toBe('Queued'); // retryable: more work is due
    expect(OUTCOME_STATE.downloading).toBe('Processing');
    expect(OUTCOME_STATE.analysing).toBe('Processing');
    expect(OUTCOME_STATE.tor_analysed).toBe('Completed');
    expect(OUTCOME_STATE.not_software).toBe('Completed');
    expect(OUTCOME_STATE.no_tor_package).toBe('Failed');
    expect(OUTCOME_STATE.abandoned).toBe('Failed');
  });
});

const record: Procurement = {
  projectId: '67109288963',
  projectName: 'ประกวดราคาจ้างเหมาเอกชนดูแลระบบสารสนเทศ',
  deptName: 'กรุงเทพมหานคร',
  deptSubName: null,
  province: null,
  district: null,
  subdistrict: null,
  registryName: 'กรุงเทพมหานคร',
  deptCode: '3100001',
  year: 2568,
  announceDate: '2024-11-04T00:00:00.000Z',
  projectTypeName: null,
  purchaseMethodName: null,
  projectMoney: 16773380,
  priceBuild: 16669097,
  status: 'unknown',
  statusSource: null,
  upstreamStatus: 'ระหว่างดำเนินการ',
  matchedKeywords: ['ระบบสารสนเทศ'],
  softwareClass: 'oandm',
  softwareScore: 2,
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
  discoveredAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
};

describe('Procurement', () => {
  test('carries who read its status and the raw feed value beside it', () => {
    const parsed = ProcurementSchema.parse(record);
    expect(parsed.statusSource).toBeNull();
    expect(parsed.upstreamStatus).toBe('ระหว่างดำเนินการ');
  });

  test('accepts an AI-read status and rejects an unknown source', () => {
    expect(
      ProcurementSchema.safeParse({ ...record, status: 'drafting', statusSource: 'ai' }).success,
    ).toBe(true);
    expect(ProcurementSchema.safeParse({ ...record, statusSource: 'guess' }).success).toBe(false);
  });

  test('counts retrieval attempts as a non-negative integer', () => {
    expect(ProcurementSchema.safeParse({ ...record, attempts: 2 }).success).toBe(true);
    expect(ProcurementSchema.safeParse({ ...record, attempts: -1 }).success).toBe(false);
    expect(ProcurementSchema.safeParse({ ...record, attempts: 1.5 }).success).toBe(false);
  });
});
