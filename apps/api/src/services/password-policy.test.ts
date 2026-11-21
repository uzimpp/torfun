import { describe, expect, test } from 'bun:test';
import { BadRequestError } from '../core/errors';
import { COMMON_PASSWORDS } from './common-passwords';
import { assertPasswordAcceptable, MIN_PASSWORD_LENGTH } from './password-policy';

const rejects = (password: string, username?: string) =>
  expect(() => assertPasswordAcceptable(password, username)).toThrow(BadRequestError);

describe('password policy', () => {
  test('rejects passwords under 8 characters', () => rejects('abc1234'));

  test('rejects a common password', () => rejects('password'));
  test('rejects a common password regardless of case', () => rejects('PassWord'));
  test('rejects another common password', () => rejects('qwertyuiop'));
  test('rejects a common password from the larger source list', () => rejects('abrakadabra'));

  test('the list holds at least the top 3000 passwords that fit the policy (ASVS V6.2.4)', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(3000);
    for (const entry of COMMON_PASSWORDS) {
      expect(entry.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
      expect(entry).toBe(entry.toLowerCase());
    }
  });

  test('rejects a password containing the username', () =>
    rejects('xx-Alice-Smith-xx', 'alice-smith'));

  test('rejects a password containing the product name', () => rejects('My-Torfun-2026'));

  test('accepts a long passphrase with no composition rules', () => {
    expect(() => assertPasswordAcceptable('correct horse battery staple')).not.toThrow();
  });

  test('accepts all-lowercase and all-digit passwords that are not common', () => {
    expect(() => assertPasswordAcceptable('zebrafishmoonlit')).not.toThrow();
    expect(() => assertPasswordAcceptable('90817263541')).not.toThrow();
  });

  test('accepts 64+ characters and multi-byte characters', () => {
    expect(() => assertPasswordAcceptable('ก'.repeat(70))).not.toThrow();
  });
});
