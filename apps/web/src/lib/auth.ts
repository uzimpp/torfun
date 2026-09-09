import { ACCESS_COOKIE } from '@torfun/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { api_url } from './config';

/** Where an officer without a Company is sent. Exported so the page it names
 *  can be checked against it rather than repeating the string. */
export const COMPANY_PATH = '/company-experiences';

/**
 * The `/api/auth/me` response. snake_case because that is the wire format the
 * API speaks; see the backend's route layer for why it stops there.
 */
export type CurrentUser = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  /** The Company the officer joined, or null before they have joined one. */
  company_id: string | null;
  /**
   * Resolved from the Company rather than stored on the user — the Company owns
   * its name (ADR-0007). Null whenever `company_id` is.
   */
  company_name: string | null;
  role: 'admin' | 'business_development_officer';
};

/** Reads the session, or null when there isn't one. Never throws. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ACCESS_COOKIE);

    if (!token) {
      return null;
    }

    const response = await fetch(`${api_url}/api/auth/me`, {
      headers: {
        Cookie: `${ACCESS_COOKIE}=${token.value}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as CurrentUser;
  } catch {
    return null;
  }
}

/**
 * Session-or-redirect, for protected pages.
 *
 * Prefer this over calling `getCurrentUser()` and branching: a page that forgets
 * the branch renders for anyone, which is how the admin console ended up
 * publicly reachable.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * As `requireUser`, and additionally the admin role.
 *
 * A signed-in non-admin goes to their dashboard rather than the login page —
 * sending them to sign in again when they already have a valid session is a
 * dead end.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/dashboard');
  return user;
}

/**
 * As `requireUser`, and additionally a Company.
 *
 * A Business Development Officer with no Company is sent to the page that
 * explains what one is, because the rest of the product compares tenders
 * against a record they do not yet have. Administrators are exempt: the
 * ingestion console was never about a vendor's own record, and inventing a
 * company to reach it would be nonsense.
 *
 * The company page itself must not call this, or it redirects to itself
 * forever.
 */
export async function requireCompany(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== 'admin' && !user.company_id) redirect(COMPANY_PATH);
  return user;
}
