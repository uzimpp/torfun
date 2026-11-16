import { describe, expect, test } from 'bun:test';
import { testEnv } from '../testing/env';

describe('ANALYSIS_CONCURRENCY', () => {
  test('is eight unless set', () => {
    expect(testEnv().ANALYSIS_CONCURRENCY).toBe(8);
  });

  test('is one to thirty-two calls to the model at once', () => {
    expect(testEnv({ ANALYSIS_CONCURRENCY: 1 }).ANALYSIS_CONCURRENCY).toBe(1);
    expect(testEnv({ ANALYSIS_CONCURRENCY: 32 }).ANALYSIS_CONCURRENCY).toBe(32);
    expect(() => testEnv({ ANALYSIS_CONCURRENCY: 0 })).toThrow();
    expect(() => testEnv({ ANALYSIS_CONCURRENCY: 33 })).toThrow();
  });
});

describe('MONGODB_DB', () => {
  test('names the database; unset or empty leaves it to the URI', () => {
    expect(testEnv({ MONGODB_DB: 'test1' }).MONGODB_DB).toBe('test1');
    expect(testEnv({ MONGODB_DB: '' }).MONGODB_DB).toBeUndefined();
    expect(testEnv().MONGODB_DB).toBeUndefined();
  });
});
