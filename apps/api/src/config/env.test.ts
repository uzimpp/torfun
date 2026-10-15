import { describe, expect, test } from 'bun:test';
import { testEnv } from '../testing/env';

describe('EGP_RUNNERS', () => {
  test('is two unless set', () => {
    expect(testEnv().EGP_RUNNERS).toBe(2);
  });

  test('can be one, or three at most: the site is shared single-file whatever the number', () => {
    expect(testEnv({ EGP_RUNNERS: 1 }).EGP_RUNNERS).toBe(1);
    expect(testEnv({ EGP_RUNNERS: 3 }).EGP_RUNNERS).toBe(3);
    expect(() => testEnv({ EGP_RUNNERS: 0 })).toThrow();
    expect(() => testEnv({ EGP_RUNNERS: 4 })).toThrow();
  });
});

describe('MONGODB_DB', () => {
  test('names the database; unset or empty leaves it to the URI', () => {
    expect(testEnv({ MONGODB_DB: 'test1' }).MONGODB_DB).toBe('test1');
    expect(testEnv({ MONGODB_DB: '' }).MONGODB_DB).toBeUndefined();
    expect(testEnv().MONGODB_DB).toBeUndefined();
  });
});
