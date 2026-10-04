import { describe, expect, test } from 'vitest';
import { IngestionOutcome } from '@torfun/types';
import type { IngestionSummaryResponse } from './api';
import { bucketOfOutcome, countTiles, outcomeBuckets, shareOf } from './outcome-buckets';

describe('outcomeBuckets', () => {
  test('groups the ten outcomes into six Thai buckets in a fixed order', () => {
    const buckets = outcomeBuckets({});
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      'วิเคราะห์แล้ว',
      'รอตรวจสอบ',
      'ไม่มี TOR',
      'ล้มเหลว',
      'รอ',
      'กำลังทำ',
    ]);
  });

  test('a sparse summary yields zero-count buckets rather than missing ones', () => {
    const buckets = outcomeBuckets({ queued: 243 });
    expect(buckets).toHaveLength(6);
    expect(buckets.find((bucket) => bucket.key === 'queued')?.count).toBe(243);
    expect(buckets.filter((bucket) => bucket.key !== 'queued').every((b) => b.count === 0)).toBe(
      true,
    );
  });

  test('sums the outcomes each bucket stands for', () => {
    const buckets = outcomeBuckets({
      tor_analysed: 38,
      needs_review: 7,
      no_tor_package: 2,
      no_tor_in_archive: 3,
      analysis_failed: 3,
      error: 1,
      abandoned: 2,
      queued: 200,
      downloading: 1,
      analysing: 2,
    });
    const count = (key: string) => buckets.find((bucket) => bucket.key === key)?.count;
    expect(count('analysed')).toBe(38);
    expect(count('needsReview')).toBe(7);
    expect(count('noTor')).toBe(5);
    expect(count('failed')).toBe(6);
    expect(count('queued')).toBe(200);
    expect(count('running')).toBe(3);
  });

  test('every outcome belongs to exactly one bucket, so nothing is dropped or double-counted', () => {
    const everyOutcome = Object.fromEntries(
      IngestionOutcome.options.map((outcome, index) => [outcome, index + 1]),
    );
    const total = Object.values(everyOutcome).reduce((sum, n) => sum + n, 0);
    const bucketed = outcomeBuckets(everyOutcome).reduce((sum, bucket) => sum + bucket.count, 0);
    expect(bucketed).toBe(total);
  });
});

describe('shareOf', () => {
  test('is the whole-number percent of the total, and 0 for an empty total', () => {
    expect(shareOf(38, 288)).toBe(13);
    expect(shareOf(0, 288)).toBe(0);
    expect(shareOf(5, 0)).toBe(0);
  });
});

describe('bucketOfOutcome', () => {
  test('names the bucket an outcome is counted in', () => {
    expect(bucketOfOutcome('tor_analysed')).toBe('analysed');
    expect(bucketOfOutcome('needs_review')).toBe('needsReview');
    expect(bucketOfOutcome('no_tor_in_archive')).toBe('noTor');
    expect(bucketOfOutcome('abandoned')).toBe('failed');
    expect(bucketOfOutcome('queued')).toBe('queued');
    expect(bucketOfOutcome('analysing')).toBe('running');
  });

  test('agrees with outcomeBuckets for every outcome', () => {
    for (const outcome of IngestionOutcome.options) {
      const counted = outcomeBuckets({ [outcome]: 1 }).find((bucket) => bucket.count === 1);
      expect(counted?.key).toBe(bucketOfOutcome(outcome));
    }
  });
});

describe('countTiles', () => {
  const summary: IngestionSummaryResponse = {
    total: 288,
    byState: { Queued: 243, Processing: 3, Completed: 44, Failed: 5 },
    byOutcome: {
      queued: 240,
      error: 3,
      downloading: 1,
      analysing: 2,
      tor_analysed: 38,
      needs_review: 1,
      analysis_failed: 2,
      no_tor_package: 4,
      no_tor_in_archive: 1,
      abandoned: 1,
    },
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 38,
    totalTorBytes: 0,
    failureCount: 4,
    lastRunAt: null,
    openDataQuota: null,
    runInProgress: false,
    runStartedAt: null,
    stopRequested: false,
    agencies: [],
  };
  const tile = (key: string, s = summary) => countTiles(s).find((t) => t.key === key)!;

  test('lists the total then the six buckets in pipeline order, with no "สำเร็จ"', () => {
    expect(countTiles(summary).map((t) => t.label)).toEqual([
      'ประกาศทั้งหมด',
      'รอ',
      'กำลังทำ',
      'วิเคราะห์แล้ว',
      'รอตรวจสอบ',
      'ไม่มี TOR',
      'ล้มเหลว',
    ]);
  });

  test('counts each tile from its outcomes', () => {
    expect(tile('total').value).toBe('288');
    expect(tile('queued').value).toBe('240');
    expect(tile('running').value).toBe('3');
    expect(tile('analysed').value).toBe('38');
    expect(tile('needsReview').value).toBe('1');
    expect(tile('noTor').value).toBe('5');
    expect(tile('failed').value).toBe('6');
  });

  test('failed carries the retryable errors as a hint, and alerts only when non-zero', () => {
    expect(tile('failed').hint).toContain('รอลองใหม่ 3');
    expect(tile('failed').alert).toBe(true);
    const calm = { ...summary, byOutcome: { queued: 1 } };
    expect(tile('failed', calm).hint).not.toContain('รอลองใหม่');
    expect(tile('failed', calm).alert).toBe(false);
  });
});
