import { describe, expect, test } from 'bun:test';

import { blockingAdvisories, type Report } from './new-advisories';

const critical = {
  url: 'https://github.com/advisories/GHSA-crit',
  title: 'RCE',
  severity: 'critical',
};
const high = { url: 'https://github.com/advisories/GHSA-high', title: 'DoS', severity: 'high' };
const moderate = {
  url: 'https://github.com/advisories/GHSA-mod',
  title: 'leak',
  severity: 'moderate',
};

describe('blockingAdvisories (#204 R-14)', () => {
  test('a critical already on the base branch still blocks the PR', () => {
    const base: Report = { next: [critical] };
    const head: Report = { next: [critical] };
    const result = blockingAdvisories(base, head);
    expect(result.present).toHaveLength(1);
    expect(result.present[0]).toContain('GHSA-crit');
    expect(result.introduced).toEqual([]);
  });

  test('a critical the PR introduces blocks the PR', () => {
    expect(blockingAdvisories({}, { next: [critical] }).present).toHaveLength(1);
  });

  test('a high already on the base branch does not block the PR', () => {
    const result = blockingAdvisories({ zod: [high] }, { zod: [high] });
    expect(result).toEqual({ present: [], introduced: [] });
  });

  test('a high the PR introduces blocks the PR', () => {
    const result = blockingAdvisories({}, { zod: [high] });
    expect(result.present).toEqual([]);
    expect(result.introduced).toHaveLength(1);
  });

  test('a new moderate does not block at the default high level', () => {
    expect(blockingAdvisories({}, { qs: [moderate] })).toEqual({ present: [], introduced: [] });
  });

  test('the same advisory under another package counts as new', () => {
    expect(blockingAdvisories({ a: [high] }, { b: [high] }).introduced).toHaveLength(1);
  });
});
