/**
 * Session cookie names.
 *
 * The API sets these and the web app reads them, which makes them a contract
 * between the two rather than an implementation detail of either — the same
 * reason the schemas live here. Written out in both apps, a rename used to
 * compile cleanly and log everyone out at runtime instead.
 *
 * The values are the wire format and must not be changed casually: every
 * signed-in browser holds cookies under the current names.
 */

/** Carries the short-lived JWT the API verifies on every request. */
export const ACCESS_COOKIE = 'torfun_token';

/** Carries the long-lived token that renews the pair. */
export const REFRESH_COOKIE = 'torfun_refresh';
