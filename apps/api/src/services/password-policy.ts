import { BadRequestError } from '../core/errors';
import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Words specific to this product that make a password easy to guess
 * (ASVS V6.1.2, V6.2.11). A password that is only one of these, or that
 * contains the product name, is refused.
 */
export const CONTEXT_WORDS = ['torfun', 'procurement', 'tender', 'egp', 'gprocurement'] as const;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Screens a new password at registration and password change (ASVS V6.2.4,
 * V6.2.11). Composition rules are deliberately absent (V6.2.5): length and
 * guessability only.
 *
 * The password is never trimmed, truncated or case-folded for storage or
 * verification (V6.2.8). Only the comparison key here is lower-cased, so
 * `Password1` cannot slip past a list that holds `password1`.
 */
export function assertPasswordAcceptable(password: string, username?: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const key = password.toLowerCase();

  if (COMMON_PASSWORDS.has(key)) {
    throw new BadRequestError('That password is too common. Choose a less guessable one.');
  }

  if (username && key.includes(username.toLowerCase())) {
    throw new BadRequestError('Password must not contain your username.');
  }

  if (CONTEXT_WORDS.some((word) => key.includes(word))) {
    throw new BadRequestError('Password must not contain the name of this service.');
  }
}
