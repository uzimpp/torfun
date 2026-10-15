import { describe, expect, test } from 'vitest';
import type { IngestionFailure } from '@torfun/types';
import type { IngestionSummaryResponse } from '@/lib/api';
import { countTiles, outcomeBuckets } from '@/lib/outcome-buckets';
import { attentionChips, donutSegments, kpiTiles, runState, timeAgoTh } from './view-models';

function summary(overrides: Partial<IngestionSummaryResponse> = {}): IngestionSummaryResponse {
  return {
    total: 288,
    byState: { Queued: 243, Processing: 3, Completed: 44, Failed: 5 },
    byOutcome: {
      queued: 240,
      error: 3,
      downloading: 1,
      analysing: 2,
      tor_analysed: 38,
      analysis_failed: 2,
      no_tor_package: 5,
    },
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 38,
    totalTorBytes: 0,
    failureCount: 4,
    lastRunAt: '2026-09-30T10:00:00.000Z',
    openDataQuota: null,
    runInProgress: false,
    runStartedAt: null,
    stopRequested: false,
    agencies: [],
    ...overrides,
  };
}

describe('donutSegments', () => {
  test('gives each non-empty bucket a share of the ring, in bucket order', () => {
    const segments = donutSegments(outcomeBuckets({ tor_analysed: 50, queued: 50 }), 0);
    expect(segments.map((segment) => segment.key)).toEqual(['analysed', 'queued']);
    expect(segments[0]).toMatchObject({ length: 50, offset: 0 });
    expect(segments[1]).toMatchObject({ length: 50, offset: 50 });
  });

  test('leaves out buckets with nothing in them', () => {
    const segments = donutSegments(outcomeBuckets({ tor_analysed: 10 }), 0);
    expect(segments.map((segment) => segment.key)).toEqual(['analysed']);
  });

  test('cuts a gap from each segment so neighbours do not touch', () => {
    const segments = donutSegments(outcomeBuckets({ tor_analysed: 50, queued: 50 }), 1);
    expect(segments[0]?.length).toBeCloseTo(49);
    expect(segments[1]?.offset).toBeCloseTo(50);
  });

  test('a single bucket is a whole ring with no notch', () => {
    const segments = donutSegments(outcomeBuckets({ queued: 7 }), 1);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.length).toBe(100);
  });

  test('is empty when there is nothing to show', () => {
    expect(donutSegments(outcomeBuckets({}), 1)).toEqual([]);
  });
});

describe('timeAgoTh', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  test('says how long ago in the largest whole unit, in Thai', () => {
    expect(timeAgoTh(ago(20_000), now)).toBe('เมื่อสักครู่');
    expect(timeAgoTh(ago(5 * 60_000), now)).toBe('5 นาทีที่แล้ว');
    expect(timeAgoTh(ago(3 * 3_600_000), now)).toBe('3 ชั่วโมงที่แล้ว');
    expect(timeAgoTh(ago(2 * 86_400_000), now)).toBe('2 วันที่แล้ว');
  });

  test('a time slightly in the future (clock skew) still reads as just now', () => {
    expect(timeAgoTh(new Date(now.getTime() + 5_000).toISOString(), now)).toBe('เมื่อสักครู่');
  });

  test('falls back to a plain date for anything older than a month', () => {
    expect(timeAgoTh(ago(45 * 86_400_000), now)).toMatch(/2569|2026/);
  });

  test('an unparseable value is a dash, never NaN', () => {
    expect(timeAgoTh('not a date', now)).toBe('—');
  });
});

describe('kpiTiles', () => {
  const tiles = (s = summary(), now = new Date('2026-09-30T10:05:00.000Z')) => kpiTiles(s, now);
  const tile = (key: string, s = summary()) => tiles(s).find((t) => t.key === key);

  test('lists the tiles the administrator reads first, in order', () => {
    expect(tiles().map((t) => t.label)).toEqual([
      'ประกาศทั้งหมด',
      'รอ',
      'กำลังทำ',
      'วิเคราะห์แล้ว',
      'ล้มเหลว',
      'รอบล่าสุด',
    ]);
  });

  test('takes every count from the shared tiles', () => {
    const shared = countTiles(summary());
    for (const key of ['total', 'queued', 'running', 'analysed', 'failed']) {
      expect(tile(key)).toMatchObject(shared.find((t) => t.key === key)!);
    }
  });

  test('says when the last run was, or that there has not been one', () => {
    expect(tile('lastRun')?.value).toBe('5 นาทีที่แล้ว');
    expect(tile('lastRun', summary({ lastRunAt: null }))?.value).toBe('ยังไม่เคยรัน');
  });

  test('a run in flight is shown on the last-run tile', () => {
    expect(tile('lastRun', summary({ runInProgress: true }))?.value).toBe('กำลังรันอยู่');
  });

  test('each tile links to the records it counts; failures to the failure log', () => {
    expect(Object.fromEntries(tiles().map((t) => [t.key, t.href]))).toEqual({
      total: '/admin/procurements',
      queued: '/admin/procurements?outcome=queued',
      running: '/admin/procurements?state=Processing',
      analysed: '/admin/procurements?outcome=tor_analysed',
      failed: '/admin/ingestion#failures',
      lastRun: '/admin/ingestion',
    });
  });
});

const NOW = new Date('2026-09-30T10:05:00.000Z');

function failure(overrides: Partial<IngestionFailure> = {}): IngestionFailure {
  return {
    projectId: 'p1',
    projectName: null,
    stage: 'download',
    kind: 'fault',
    error: 'socket hang up',
    at: '2026-09-30T10:01:00.000Z',
    ...overrides,
  };
}

describe('runState', () => {
  test('a run in flight says so, and when it began', () => {
    expect(
      runState(summary({ runInProgress: true, runStartedAt: '2026-09-30T10:00:00.000Z' }), NOW),
    ).toEqual({ running: true, label: 'กำลังดึงข้อมูล…', detail: 'เริ่ม 5 นาทีที่แล้ว' });
  });

  test('a stop that was asked for is named', () => {
    expect(runState(summary({ runInProgress: true, stopRequested: true }), NOW).label).toBe(
      'กำลังหยุดรอบดึงข้อมูล',
    );
  });

  test('otherwise it says when the last run was, or that there has been none', () => {
    expect(runState(summary(), NOW)).toEqual({
      running: false,
      label: 'รอบล่าสุด 5 นาทีที่แล้ว',
      detail: null,
    });
    expect(runState(summary({ lastRunAt: null }), NOW).label).toBe('ยังไม่เคยดึงข้อมูล');
  });
});

describe('attentionChips', () => {
  const keys = (s: IngestionSummaryResponse, f: IngestionFailure[] = []) =>
    attentionChips(s, f, NOW).map((chip) => chip.key);

  test('nothing to look at is an empty row', () => {
    expect(keys(summary({ byOutcome: { queued: 10, tor_analysed: 5 } }))).toEqual([]);
  });

  test('held and failed records show with their counts and filtered links', () => {
    const chips = attentionChips(
      summary({ byOutcome: { needs_review: 3, analysis_failed: 1, abandoned: 1 } }),
      [],
      NOW,
    );
    expect(chips).toEqual([
      expect.objectContaining({
        key: 'needsReview',
        label: 'รอตรวจสอบ',
        count: 3,
        href: '/admin/procurements?outcome=needs_review',
      }),
      expect.objectContaining({
        key: 'failed',
        label: 'ล้มเหลว',
        count: 2,
        href: '/admin/procurements?state=Failed',
      }),
    ]);
  });

  test('a refusal from the site during the last run is flagged; one from an older run is not', () => {
    const s = summary({ byOutcome: {} });
    const refused = failure({
      error: 'HTTP 429 from https://process5.gprocurement.go.th/x — treating as rate limited',
    });
    expect(keys(s, [refused])).toEqual(['refused']);
    expect(keys(s, [{ ...refused, at: '2026-09-29T08:00:00.000Z' }])).toEqual([]);
    expect(attentionChips(s, [refused], NOW)[0]?.label).toBe('รอบล้มเหลวเพราะเว็บปฏิเสธ (429)');
  });

  test('unknown timeline codes in the last run are counted once per code', () => {
    const code = (announceType: string) =>
      failure({
        stage: 'timeline',
        error: `Unrecognised announcement code "${announceType}" (2026-09-01); the status was not changed by it.`,
      });
    const chips = attentionChips(
      summary({ byOutcome: {} }),
      [code('X1'), code('X1'), code('X2')],
      NOW,
    );
    expect(chips).toEqual([expect.objectContaining({ key: 'unknownCodes', count: 2 })]);
  });

  test('a low open-data quota is flagged only when the quota is known', () => {
    const low = summary({
      byOutcome: {},
      openDataQuota: { remainingDay: 50, limitDay: 1000, observedAt: '2026-09-30T09:00:00.000Z' },
    });
    expect(keys(low)).toEqual(['quota']);
    expect(keys(summary({ byOutcome: {}, openDataQuota: null }))).toEqual([]);
  });
});
