import { ACCESS_COOKIE, REFRESH_COOKIE } from '@torfun/types';
import { NextResponse, type NextRequest } from 'next/server';

import { renewSession } from './lib/session';

/**
 * Renews a lapsed session before the page renders.
 *
 * The access cookie lives fifteen minutes and the refresh cookie thirty days,
 * so "no access cookie but a refresh cookie" is the signal to renew — and the
 * only case that costs a network call. Everything else is two cookie reads.
 *
 * This has to happen here rather than in `lib/auth.ts`, because a Server
 * Component can read cookies but cannot set them; the proxy can do both. The
 * decisions live in `lib/session.ts`; this file is the Next.js shell around
 * them, and must stay at the root of `src` for Next to find it at all.
 *
 * (Next.js 16 renamed Middleware to Proxy — same mechanism, new file name.)
 */
export async function proxy(request: NextRequest) {
  const refresh = request.cookies.get(REFRESH_COOKIE);

  // Either the access token is still good, or there is no session at all and
  // the page itself decides where to send the visitor.
  if (request.cookies.has(ACCESS_COOKIE) || !refresh) {
    return NextResponse.next();
  }

  const renewal = await renewSession(refresh.value);

  // The API is down. Let the page render and report the outage itself, rather
  // than turning it into a redirect to the login screen.
  if (renewal.outcome === 'unavailable') return NextResponse.next();

  if (renewal.outcome === 'ended') {
    // Drop the dead cookie so this doesn't fire again on every navigation.
    const response = NextResponse.next();
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  // Hand the new access token to this same request, so the page renders signed
  // in now instead of a round trip later.
  const headers = new Headers(request.headers);
  if (renewal.accessCookie) {
    const existing = headers.get('cookie');
    headers.set('cookie', existing ? `${existing}; ${renewal.accessCookie}` : renewal.accessCookie);
  }

  const response = NextResponse.next({ request: { headers } });
  for (const cookie of renewal.setCookies) {
    response.headers.append('set-cookie', cookie);
  }
  return response;
}

export const config = {
  // Everything but Next's own static output; the renewal itself is gated on
  // the cookie check above, so this costs almost nothing per request.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
