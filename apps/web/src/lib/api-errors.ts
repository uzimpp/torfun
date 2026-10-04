import { ApiError, SessionEndedError } from './api';

export const SESSION_ENDED_MESSAGE = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';

/** The sentence to show for a failed request: the server's own reason when it gave one. */
export function messageFor(caught: unknown, fallback: string): string {
  if (caught instanceof SessionEndedError) return SESSION_ENDED_MESSAGE;
  return caught instanceof ApiError ? caught.message : fallback;
}

/**
 * Why a read failed, in the three ways an administrator acts on differently:
 * the API cannot be reached (wait or check the service), it answered with an
 * error (retry, then report), or the session ended (sign in; retrying repeats it).
 */
export type LoadErrorKind = 'unreachable' | 'broken' | 'sessionEnded';

export interface LoadError {
  kind: LoadErrorKind;
  message: string;
}

export function toLoadError(caught: unknown, fallback: string): LoadError {
  if (caught instanceof SessionEndedError) {
    return { kind: 'sessionEnded', message: SESSION_ENDED_MESSAGE };
  }
  if (caught instanceof ApiError) {
    return caught.status === 0
      ? { kind: 'unreachable', message: fallback }
      : { kind: 'broken', message: caught.message };
  }
  return { kind: 'broken', message: fallback };
}
