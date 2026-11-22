import { describe, expect, test } from 'bun:test';
import { AutoApproveDomain, emailDomainOf } from './company-membership';

describe('AutoApproveDomain', () => {
  test('normalises what a manager types', () => {
    expect(AutoApproveDomain.parse('  @ACME.co.th ')).toBe('acme.co.th');
  });

  test('refuses public mailbox providers, which would let anyone in', () => {
    for (const domain of ['gmail.com', 'Hotmail.com', '@outlook.co.th', 'yahoo.co.th']) {
      expect(AutoApproveDomain.safeParse(domain).success).toBe(false);
    }
  });

  test('refuses things that are not a domain', () => {
    for (const domain of [
      '',
      'acme',
      'acme.',
      '*.acme.co.th',
      'a b.com',
      'acme.co.th/x',
      '-a.com',
    ]) {
      expect(AutoApproveDomain.safeParse(domain).success).toBe(false);
    }
  });
});

describe('emailDomainOf', () => {
  test('is the lower-cased part after the one @', () => {
    expect(emailDomainOf('Somchai@ACME.co.th')).toBe('acme.co.th');
  });

  test('a look-alike domain is a different domain', () => {
    // Callers compare for equality, so these must not come back as acme.co.th.
    expect(emailDomainOf('a@acme.co.th.evil.com')).toBe('acme.co.th.evil.com');
    expect(emailDomainOf('a@evil-acme.co.th')).toBe('evil-acme.co.th');
  });

  test('anything that is not one address has no domain', () => {
    for (const value of [undefined, null, '', 'acme.co.th', '@acme.co.th', 'a@b@acme.co.th']) {
      expect(emailDomainOf(value)).toBeNull();
    }
  });
});
