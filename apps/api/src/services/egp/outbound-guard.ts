import {
  ANNOUNCEMENT_FEED_URL,
  GREEN_BOOK_URL,
  OPEN_DATA_BASE,
  PROCUREMENT_DETAIL_URL,
  PROJECT_DETAIL_URL,
  TOR_DOWNLOAD_URL,
  TOR_INFO_URL,
  TOR_ZIP_LIST_URL,
} from './constants';

/**
 * Outbound request policy for ingestion (ASVS V1.3.6, V12.3.2, V15.2.5;
 * threat T-10, SSRF and redirect abuse).
 *
 * Every upstream URL is built from a constant, so the remaining SSRF path is a
 * *redirect*: a compromised or misconfigured e-GP host answering 302 to
 * `http://169.254.169.254/` (the cloud metadata endpoint) or to a private
 * address would otherwise be followed by `fetch` without a second look.
 *
 * So: HTTPS only, default port, no credentials in the URL, and the host must be
 * one the constants already name. The allowlist is derived from those
 * constants, so adding an endpoint cannot silently widen it, and a new host
 * has to be added here on purpose.
 */
export const UPSTREAM_HOSTS: ReadonlySet<string> = new Set(
  [
    OPEN_DATA_BASE,
    TOR_INFO_URL,
    TOR_DOWNLOAD_URL,
    GREEN_BOOK_URL,
    PROJECT_DETAIL_URL,
    PROCUREMENT_DETAIL_URL,
    TOR_ZIP_LIST_URL,
    ANNOUNCEMENT_FEED_URL,
  ].map((url) => new URL(url).hostname),
);

/** Redirect hops followed before giving up. e-GP's own moves are at most two. */
export const MAX_REDIRECTS = 3;

export class OutboundBlockedError extends Error {
  constructor(reason: string) {
    super(`Outbound request refused: ${reason}`);
    this.name = 'OutboundBlockedError';
  }
}

/** Throws unless `raw` is an HTTPS URL on an allowlisted upstream host. */
export function assertAllowedUpstream(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundBlockedError('not a valid URL');
  }
  if (url.protocol !== 'https:') throw new OutboundBlockedError(`protocol ${url.protocol}`);
  if (url.username || url.password) throw new OutboundBlockedError('credentials in URL');
  if (url.port !== '') throw new OutboundBlockedError(`non-default port ${url.port}`);
  if (!UPSTREAM_HOSTS.has(url.hostname)) {
    throw new OutboundBlockedError(`host ${url.hostname} is not an upstream source`);
  }
  return url;
}
