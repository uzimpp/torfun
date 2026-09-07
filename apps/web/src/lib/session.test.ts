// @vitest-environment node
// jsdom's Headers has no getSetCookie, and this module never touches the DOM.

import { ACCESS_COOKIE, REFRESH_COOKIE } from '@torfun/types';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { renewSession } from './session';

/** `fetch`'s call signature alone — `typeof fetch` carries extras a stub can't. */
type FetchFn = (url: string | URL, init?: RequestInit) => Promise<Response>;

const ACCESS = `${ACCESS_COOKIE}=new-access; Path=/; HttpOnly; Max-Age=900`;
const REFRESH = `${REFRESH_COOKIE}=new-refresh; Path=/api/auth; HttpOnly; Max-Age=2592000`;

function respondWith(init: ResponseInit & { setCookies?: string[] }) {
  const headers = new Headers();
  for (const cookie of init.setCookies ?? []) headers.append('set-cookie', cookie);
  // Typed as `fetch` so the recorded call arguments keep their shape.
  return vi.fn<FetchFn>(async () => new Response(null, { status: init.status ?? 200, headers }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renewSession', () => {
  test('presents the refresh token to the API', async () => {
    const fetchMock = respondWith({ setCookies: [ACCESS, REFRESH] });
    vi.stubGlobal('fetch', fetchMock);

    await renewSession('the-token');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/auth\/refresh$/);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE}=the-token` },
    });
  });

  test('forwards the renewed cookies and unpicks the access token', async () => {
    vi.stubGlobal('fetch', respondWith({ setCookies: [ACCESS, REFRESH] }));

    const renewal = await renewSession('the-token');

    expect(renewal.outcome).toBe('renewed');
    if (renewal.outcome !== 'renewed') return;

    // Both go to the browser untouched, attributes and all.
    expect(renewal.setCookies).toEqual([ACCESS, REFRESH]);
    // The access token is stripped to name=value, ready for a Cookie header.
    expect(renewal.accessCookie).toBe(`${ACCESS_COOKIE}=new-access`);
  });

  test('reports a rejected token as a session that has ended', async () => {
    vi.stubGlobal('fetch', respondWith({ status: 401 }));

    expect((await renewSession('revoked')).outcome).toBe('ended');
  });

  test('an unreachable API is not the same as a signed-out user', async () => {
    // Otherwise a backend blip logs out everyone who reloads during it.
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchFn>(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    expect((await renewSession('the-token')).outcome).toBe('unavailable');
  });

  test('a renewal with no access cookie is reported rather than assumed', async () => {
    vi.stubGlobal('fetch', respondWith({ setCookies: [REFRESH] }));

    const renewal = await renewSession('the-token');

    expect(renewal.outcome).toBe('renewed');
    if (renewal.outcome !== 'renewed') return;
    expect(renewal.accessCookie).toBeNull();
  });
});
