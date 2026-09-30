import { describe, expect, test } from 'vitest';
import { IngestionOutcome } from '@torfun/types';
import { bucketOfOutcome, outcomeBuckets, shareOf } from './outcome-buckets';

describe('outcomeBuckets', () => {
  test('groups the ten outcomes into six Thai buckets in a fixed order', () => {
    const buckets = outcomeBuckets({});
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      'วิเคราะห์แล้ว',
      'AI: ไม่ใช่งานซอฟต์แวร์',
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
      not_software: 4,
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
    expect(count('notSoftware')).toBe(4);
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
    expect(bucketOfOutcome('not_software')).toBe('notSoftware');
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
