import { describe, expect, test } from 'bun:test';
import {
  EMPTY_MILESTONES,
  IngestionOutcome,
  IngestionState,
  MilestonesSchema,
  OUTCOME_LABELS,
  OUTCOME_STATE,
  ProcurementSchema,
  ProcurementStatus,
  STATE_LABELS,
  STATUS_HISTORY_LIMIT,
  appendStatusChange,
  HOLD_REASON_LABELS,
  HoldReason,
  SoftwareJudgementSchema,
  STATUS_LABELS,
  TorAnalysisSchema,
  TombstoneSchema,
  TOMBSTONE_REASON_LABELS,
  TombstoneReason,
  type Procurement,
  type Tombstone,
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
    expect(STATUS_LABELS.unknown).toBe('ยังไม่ทราบสถานะ');
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
        'needs_review',
        'no_tor_in_archive',
        'no_tor_package',
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
  deptCode: '3100001',
  budgetYear: 2568,
  announceDate: '2024-11-04T00:00:00.000Z',
  projectTypeName: null,
  purchaseMethodName: null,
  projectMoney: 16773380,
  priceBuild: 16669097,
  status: 'unknown',
  milestones: EMPTY_MILESTONES,
  timelineCheckedAt: null,
  deadlineAt: null,
  deadlineSource: null,
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
  discoveredAt: '2026-09-30T00:00:00.000Z',
  sourceHash: null,
  updatedAt: '2026-09-30T00:00:00.000Z',
};

describe('Procurement', () => {
  test('reads a record stored with fields the schema has since dropped, and drops them', () => {
    const stored = {
      ...record,
      registryName: 'กรุงเทพมหานคร',
      upstreamStatus: 'ระหว่างดำเนินการ',
      matchedKeywords: ['ระบบสารสนเทศ'],
      softwareClass: 'oandm',
      softwareScore: 2,
      eBidding: true,
    };

    const parsed = ProcurementSchema.parse(stored);

    expect(parsed).toEqual(record);
  });

  test('carries no record of who read the status: it comes from the timeline alone', () => {
    const parsed = ProcurementSchema.parse({ ...record, statusSource: 'ai' });

    expect('statusSource' in parsed).toBe(false);
  });

  test('requires every milestone key, each null or a possibly undated entry', () => {
    const reached = {
      ...EMPTY_MILESTONES,
      drafted: { at: null },
      invited: { at: '2026-10-01T00:00:00.000Z' },
    };

    expect(MilestonesSchema.safeParse(reached).success).toBe(true);
    expect(MilestonesSchema.safeParse({ ...EMPTY_MILESTONES, drafted: undefined }).success).toBe(
      false,
    );
    expect(MilestonesSchema.safeParse({ ...EMPTY_MILESTONES, priced: { at: 5 } }).success).toBe(
      false,
    );
    expect(ProcurementSchema.safeParse({ ...record, milestones: undefined }).success).toBe(false);
  });

  test('counts retrieval attempts as a non-negative integer', () => {
    expect(ProcurementSchema.safeParse({ ...record, attempts: 2 }).success).toBe(true);
    expect(ProcurementSchema.safeParse({ ...record, attempts: -1 }).success).toBe(false);
    expect(ProcurementSchema.safeParse({ ...record, attempts: 1.5 }).success).toBe(false);
  });
});

describe('status history', () => {
  const change = (n: number) => ({
    state: 'Processing' as const,
    outcome: 'downloading' as const,
    at: `2026-10-03T00:00:${String(n).padStart(2, '0')}.000Z`,
  });

  test('appends the new entry after the existing ones', () => {
    expect(appendStatusChange([change(1)], change(2))).toEqual([change(1), change(2)]);
  });

  test('keeps only the last STATUS_HISTORY_LIMIT entries, oldest dropped first', () => {
    const full = Array.from({ length: STATUS_HISTORY_LIMIT }, (_, n) => change(n));

    const next = appendStatusChange(full, change(STATUS_HISTORY_LIMIT));

    expect(STATUS_HISTORY_LIMIT).toBe(50);
    expect(next).toHaveLength(STATUS_HISTORY_LIMIT);
    expect(next[0]).toEqual(change(1));
    expect(next.at(-1)).toEqual(change(STATUS_HISTORY_LIMIT));
  });
});

describe('TorAnalysisSchema', () => {
  const stored = {
    summary: 'จ้างพัฒนาระบบ',
    scopeOfWork: [],
    budgetThb: null,
    deadlineAt: null,
    durationDays: null,
    techStack: [],
    targetPlatforms: [],
    requiredQualifications: [],
  };

  test('still reads an analysis stored before reasons and prompt versions were kept', () => {
    const parsed = TorAnalysisSchema.parse(stored);

    expect(parsed.reason ?? null).toBeNull();
    expect(parsed.promptVersion ?? null).toBeNull();
  });

  test('ignores the verdict flags an older analysis carried instead of failing to read it', () => {
    const parsed = TorAnalysisSchema.parse({
      ...stored,
      isSoftwareProject: true,
      confidence: 'high',
    });

    expect(parsed).not.toHaveProperty('isSoftwareProject');
    expect(parsed).not.toHaveProperty('confidence');
  });
});

describe('SoftwareJudgementSchema', () => {
  const judgement = {
    isSoftware: false,
    confidence: 'high',
    reason: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
  };

  test('reads a judgement and refuses a confidence outside high and low', () => {
    expect(SoftwareJudgementSchema.safeParse(judgement).success).toBe(true);
    expect(SoftwareJudgementSchema.safeParse({ ...judgement, confidence: 'medium' }).success).toBe(
      false,
    );
  });

  test('refuses a reason longer than 200 characters', () => {
    expect(
      SoftwareJudgementSchema.safeParse({ ...judgement, reason: 'ก'.repeat(201) }).success,
    ).toBe(false);
  });
});

describe('HOLD_REASON_LABELS', () => {
  test('has a distinct Thai label for every reason a record can be held', () => {
    const labels = HoldReason.options.map((reason) => HOLD_REASON_LABELS[reason]);
    for (const label of labels) expect(label).toMatch(THAI);
    expect(new Set(labels).size).toBe(HoldReason.options.length);
  });
});

describe('TombstoneSchema', () => {
  const tombstone: Tombstone = {
    projectId: '66059313551',
    reason: 'ai_not_software',
    evidence: 'จัดซื้อเครื่องคอมพิวเตอร์ 50 เครื่อง',
    promptVersion: '2026-10-01.1',
    decidedAt: '2026-10-02T00:00:00.000Z',
    decidedBy: null,
  };

  test('says why a project was dropped, in one of three ways, each with a Thai label', () => {
    const reasons: string[] = [...TombstoneReason.options];
    expect(reasons.sort()).toEqual(['admin_deleted', 'admin_non_software', 'ai_not_software']);
    for (const reason of TombstoneReason.options) {
      expect(TOMBSTONE_REASON_LABELS[reason]).toMatch(THAI);
    }
  });

  test('keeps the quote to 200 characters, like the judgement it comes from', () => {
    expect(TombstoneSchema.safeParse(tombstone).success).toBe(true);
    expect(TombstoneSchema.safeParse({ ...tombstone, evidence: 'ก'.repeat(201) }).success).toBe(
      false,
    );
  });

  test('rejects a reason outside the three', () => {
    expect(TombstoneSchema.safeParse({ ...tombstone, reason: 'because' }).success).toBe(false);
  });

  test('does not carry the name or archive of the record it replaced', () => {
    const parsed = TombstoneSchema.parse({ ...tombstone, projectName: 'x', zipId: 'z' });
    expect(parsed).toEqual(tombstone);
  });

  test('may keep what the feed said about the project, so a restore needs no sweep', () => {
    const feed = {
      projectName: 'จ้างพัฒนาระบบ',
      deptName: 'กรมศุลกากร',
      deptCode: '0305',
      announceDate: '2026-10-05T00:00:00.000Z',
      budgetYear: 2570,
      purchaseMethodName: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    };
    expect(TombstoneSchema.parse({ ...tombstone, feed })).toEqual({ ...tombstone, feed });
    // Older tombstones were written without it.
    expect(TombstoneSchema.parse(tombstone).feed ?? null).toBeNull();
    expect(TombstoneSchema.safeParse({ ...tombstone, feed: { deptName: 'x' } }).success).toBe(
      false,
    );
  });
});

describe('Procurement approval', () => {
  test('records who approved a held record and when, or nothing', () => {
    const approved = { ...record, approvedBy: 'admin', approvedAt: '2026-10-03T00:00:00.000Z' };
    expect(ProcurementSchema.parse(approved)).toEqual(approved);
  });
});
