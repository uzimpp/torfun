import { ACCESS_COOKIE, REFRESH_COOKIE } from '@torfun/types';

import { internal_api_url } from './config';

/**
 * Session renewal against the API.
 *
 * Kept apart from `proxy.ts` — which can only live at the root of `src` and is
 * awkward to drive in a test — so the decisions here are reachable without
 * Next's request pipeline. This module knows nothing about `NextRequest`; the
 * proxy translates.
 *
 * Reading the session is `auth.ts`; this is renewing it.
 */

/** What the caller should do with the response, given how renewal went. */
export type Renewal =
  /** A new pair was issued; pass these cookies on to the browser verbatim. */
  | { outcome: 'renewed'; setCookies: string[]; accessCookie: string | null }
  /** Revoked, expired, or deactivated — the session is over. */
  | { outcome: 'ended' }
  /** The API couldn't be reached, which says nothing about the session. */
  | { outcome: 'unavailable' };

export async function renewSession(refreshToken: string): Promise<Renewal> {
  let response: Response;
  try {
    response = await fetch(`${internal_api_url}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE}=${refreshToken}` },
    });
  } catch {
    // Distinct from 'ended' on purpose: an outage must not look like a signed
    // -out user, or a backend blip logs out everybody who reloads during it.
    return { outcome: 'unavailable' };
  }

  if (!response.ok) return { outcome: 'ended' };

  // Forwarded whole so the paths, Max-Age and Secure flags stay exactly as the
  // API set them; only the access token is unpicked, to be handed to the
  // in-flight request as well as to the browser.
  const setCookies = response.headers.getSetCookie();
  const accessCookie =
    setCookies.find((cookie) => cookie.startsWith(`${ACCESS_COOKIE}=`))?.split(';')[0] ?? null;

  return { outcome: 'renewed', setCookies, accessCookie };
}
