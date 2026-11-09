// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { authReturnCookiePath, safeAuthReturnPath } from './auth-return';

describe('notification sign-in return paths', () => {
  test('preserves only the allowed inbox, LINE and TOR destinations', () => {
    const token = 'x'.repeat(43);
    expect(safeAuthReturnPath(`/notifications?verify_email=${token}`)).toBe(
      `/notifications?verify_email=${token}`,
    );
    expect(safeAuthReturnPath('/notifications/link-line?link_token=one%2Btwo')).toBe(
      '/notifications/link-line?link_token=one%2Btwo',
    );
    expect(safeAuthReturnPath('/tor/69100000001')).toBe('/tor/69100000001');
    expect(authReturnCookiePath(encodeURIComponent('/notifications'))).toBe('/notifications');
  });
  test('cannot redirect to an external, encoded or privileged destination', () => {
    for (const value of [
      'https://attacker.test',
      '//attacker.test',
      '/\\attacker.test',
      '/admin/accounts',
      '/notifications/../../admin',
      '/notifications#https://attacker.test',
      '/tor/%2F%2Fattacker.test',
      '%ZZ',
    ])
      expect(safeAuthReturnPath(value)).toBeNull();
    expect(authReturnCookiePath(encodeURIComponent('//attacker.test'))).toBeNull();
    expect(safeAuthReturnPath('/notifications?redirect=https://attacker.test')).toBe(
      '/notifications',
    );
  });
});
