import { describe, expect, test } from 'vitest';
import { ApiError, SessionEndedError } from './api';
import { SESSION_ENDED_MESSAGE, messageFor, toLoadError } from './api-errors';

describe('messageFor', () => {
  test('an ended session gets the sign-in-again sentence', () => {
    expect(messageFor(new SessionEndedError(), 'fallback')).toBe(SESSION_ENDED_MESSAGE);
  });

  test('an API refusal keeps the server’s own message', () => {
    expect(messageFor(new ApiError('Already running', 409), 'fallback')).toBe('Already running');
  });

  test('anything else falls back', () => {
    expect(messageFor(new TypeError('x'), 'fallback')).toBe('fallback');
  });
});

describe('toLoadError', () => {
  test('tells an unreachable API apart from a broken one and an ended session', () => {
    expect(toLoadError(new ApiError('Cannot reach the API', 0), 'โหลดไม่ได้')).toEqual({
      kind: 'unreachable',
      message: 'โหลดไม่ได้',
    });
    expect(toLoadError(new ApiError('boom', 500), 'โหลดไม่ได้')).toEqual({
      kind: 'broken',
      message: 'boom',
    });
    expect(toLoadError(new SessionEndedError(), 'โหลดไม่ได้')).toEqual({
      kind: 'sessionEnded',
      message: SESSION_ENDED_MESSAGE,
    });
  });

  test('a non-API failure is broken, worded by the fallback', () => {
    expect(toLoadError(new TypeError('x'), 'โหลดไม่ได้')).toEqual({
      kind: 'broken',
      message: 'โหลดไม่ได้',
    });
  });
});
