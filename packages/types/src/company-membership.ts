import { z } from 'zod';

/**
 * Who may join a Company, and how (pentest finding P-1, issue #200).
 *
 * Every Company has at least one **Company Manager**: the officer who created
 * it, and anyone a manager promotes. A manager is a role *inside one Company*,
 * not a `UserRole` — a Site Administrator is still the only system-wide role
 * above an officer, and holds no Company at all.
 *
 * Joining is a request a manager approves. A manager may switch on automatic
 * approval for one email domain, and only for a domain their own verified
 * email is at: so a stranger cannot claim `acme.co.th` for a look-alike
 * Company, and a public mail provider can never be the key, since that would
 * let anyone in.
 */

/**
 * Public mailbox providers. Anyone can hold an address there, so an address
 * there says nothing about who someone works for. Not exhaustive and need not
 * be: a domain missing from it still requires the manager's own address to be
 * at that domain.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.th',
  'outlook.com',
  'outlook.co.th',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.th',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

/** A DNS name: labels of letters, digits and inner hyphens, at least one dot. */
const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * The domain a manager types for automatic approval. Lower-cased, never a
 * public mailbox provider. A leading `@` is forgiven because people copy it
 * from an address.
 */
export const AutoApproveDomain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ''))
  .pipe(
    z
      .string()
      .regex(HOSTNAME, 'โดเมนไม่ถูกต้อง เช่น example.co.th')
      .refine(
        (domain) => !PUBLIC_EMAIL_DOMAINS.has(domain),
        'ใช้โดเมนอีเมลสาธารณะ เช่น gmail.com ไม่ได้',
      ),
  );

/**
 * The domain of an address, lower-cased, or null for anything that is not one
 * address. Compared for equality only: `a@acme.co.th.evil.com` and
 * `a@evil-acme.co.th` must never pass for `acme.co.th`, and a subdomain counts
 * only if a manager names it.
 */
export function emailDomainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at !== email.indexOf('@')) return null;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return HOSTNAME.test(domain) ? domain : null;
}

/** What a join request answered: in at once, or waiting for a manager. */
export const JoinOutcome = z.enum(['joined', 'pending']);
export type JoinOutcome = z.infer<typeof JoinOutcome>;
