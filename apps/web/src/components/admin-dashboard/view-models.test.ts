import { describe, expect, test } from 'vitest';
import type { IngestionSummaryResponse } from '@/lib/api';
import { outcomeBuckets } from './outcome-buckets';
import { donutSegments, kpiTiles, timeAgoTh } from './view-models';

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
      not_software: 4,
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

  test('lists the six tiles the administrator reads first, in order', () => {
    expect(tiles().map((t) => t.label)).toEqual([
      'ประกาศทั้งหมด',
      'รอดำเนินการ',
      'กำลังประมวลผล',
      'สำเร็จ',
      'ล้มเหลว',
      'รอบล่าสุด',
    ]);
  });

  test('counts the queue, the work in flight and the analysed TORs', () => {
    expect(tile('total')?.value).toBe('288');
    expect(tile('queued')?.value).toBe('243');
    expect(tile('processing')?.value).toBe('3');
    expect(tile('processing')?.hint).toContain('ดึงข้อมูล 1');
    expect(tile('processing')?.hint).toContain('ประมวลผล 2');
    expect(tile('done')?.value).toBe('38');
  });

  test('counts failures the way the chart does, and flags them only when there are some', () => {
    // analysis_failed 2 + error 3 + abandoned 0
    expect(tile('failed')?.value).toBe('5');
    expect(tile('failed')?.alert).toBe(true);
    expect(tile('failed', summary({ byOutcome: { queued: 1 } }))?.alert).toBe(false);
  });

  test('says when the last run was, or that there has not been one', () => {
    expect(tile('lastRun')?.value).toBe('5 นาทีที่แล้ว');
    expect(tile('lastRun', summary({ lastRunAt: null }))?.value).toBe('ยังไม่เคยรัน');
  });

  test('a run in flight is shown on the last-run tile', () => {
    expect(tile('lastRun', summary({ runInProgress: true }))?.value).toBe('กำลังรันอยู่');
  });
});
