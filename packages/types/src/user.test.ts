import { describe, expect, test } from 'bun:test';
import { fullName, UserSchema } from './user';

const valid = {
  id: '68b1f0c2a1b2c3d4e5f60718',
  username: 'somchai',
  firstName: 'Somchai',
  lastName: 'Prasert',
  companyId: '68b1f0c2a1b2c3d4e5f60719',
  role: 'business_development_officer',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('UserSchema', () => {
  test('accepts a password-only account with no email', () => {
    const user = UserSchema.parse(valid);
    expect(user.email).toBeUndefined();
    expect(user.isActive).toBe(true);
  });

  test('rejects the pre-reconciliation role names', () => {
    expect(UserSchema.safeParse({ ...valid, role: 'ADMIN' }).success).toBe(false);
  });

  test('requires a non-empty first and last name', () => {
    expect(UserSchema.safeParse({ ...valid, firstName: '' }).success).toBe(false);
    expect(UserSchema.safeParse({ ...valid, lastName: '' }).success).toBe(false);
  });
});

describe('fullName', () => {
  test('joins the two parts', () => {
    expect(fullName({ firstName: 'Somchai', lastName: 'Prasert' })).toBe('Somchai Prasert');
  });

  test('does not leave a trailing space when a Google account has no family name', () => {
    expect(fullName({ firstName: 'Somchai', lastName: '' })).toBe('Somchai');
  });
});
