/**
 * Session cookie names.
 *
 * The API sets these and the web app reads them, which makes them a contract
 * between the two, not an implementation detail of either. That is the same
 * reason the schemas live here. Written out separately in both apps, a rename
 * would compile cleanly and log everyone out at runtime.
 *
 * The values are the wire format and must not be changed casually: every
 * signed-in browser holds cookies under the current names.
 */

/** Carries the short-lived JWT the API verifies on every request. */
export const ACCESS_COOKIE = 'torfun_token';

/** Carries the long-lived token that renews the pair. */
export const REFRESH_COOKIE = 'torfun_refresh';
