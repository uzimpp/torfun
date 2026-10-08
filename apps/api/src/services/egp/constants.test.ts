import { describe, expect, test } from 'bun:test';
import { FEED_REGISTRY, SOURCE_REGISTRY } from './constants';

describe('FEED_REGISTRY', () => {
  test('names every Source Registry agency, so none is left out of the sweep', () => {
    const inFeed = FEED_REGISTRY.map((agency) => agency.registryName);
    for (const name of SOURCE_REGISTRY) expect(inFeed).toContain(name);
  });

  test('asks the feed about each agency once', () => {
    const ids = FEED_REGISTRY.map((agency) => agency.deptId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
