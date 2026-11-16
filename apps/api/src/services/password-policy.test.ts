import { describe, expect, test } from 'bun:test';
import { BadRequestError } from '../core/errors';
import { assertPasswordAcceptable } from './password-policy';

const rejects = (password: string, username?: string) =>
  expect(() => assertPasswordAcceptable(password, username)).toThrow(BadRequestError);

describe('password policy', () => {
  test('rejects passwords under 8 characters', () => rejects('abc1234'));

  test('rejects a common password', () => rejects('password'));
  test('rejects a common password regardless of case', () => rejects('PassWord'));
  test('rejects another common password', () => rejects('qwertyuiop'));

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
