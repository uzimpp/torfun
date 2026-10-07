/**
 * Fixed configuration for the e-GP ingestion pipeline.
 *
 * Every value here was established empirically by the Python POC; the reasons
 * are recorded so they don't get "simplified" away. See
 * docs/poc_fullflow/README.md for the full investigation.
 */

/**
 * Open-data API. Not a Discovery source any more (ADR-0018): it holds only
 * projects that already have a signed contract. Kept for the winner lookup to
 * come and the diagnostics check. The `/service/<name>` form is the working one.
 */
export const OPEN_DATA_BASE = 'https://opend.data.go.th/govspending/service';
export const DEPT_URL = `${OPEN_DATA_BASE}/egp-dept`;
export const CONTRACT_URL = `${OPEN_DATA_BASE}/egp-contract`;

/**
 * e-GP procurement app, used purely as a keyed lookup by project id.
 *
 * These endpoints need no token, cookie or auth. We deliberately never
 * touch the announcement *search* endpoints, which sit behind a Cloudflare
 * Turnstile bot check, and implement none of the site's client-side
 * generateToken/RDCrypto scheme — discovery comes from the announcement feed
 * below instead, which answers without either.
 */
export const TOR_INFO_URL =
  'https://process5.gprocurement.go.th/egp-approval-service/apv-common/infoProcureDocAnnounZip';
export const TOR_DOWNLOAD_URL =
  'https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest';
export const GREEN_BOOK_URL =
  'https://process5.gprocurement.go.th/egp-oann10-service/pb/a-egp-allt-project/announcement/greenBook';

/**
 * The Source Registry, keyed by the Thai name a human would query with. What
 * each is asked for in the feed is `FEED_REGISTRY`.
 */
export const SOURCE_REGISTRY = [
  'กรมศุลกากร',
  'สำนักงานพัฒนารัฐบาลดิจิทัล',
  'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
  'กรมสรรพากร',
  'กรุงเทพมหานคร',
] as const;

/**
 * e-GP's announcement feed, the Discovery source (ADR-0018). One call answers
 * for one agency, one announcement type and one day, and needs no token, cookie
 * or captcha. Unlike the open-data API it lists tenders before they are
 * awarded, which is the only stage anyone can bid in.
 */
export const ANNOUNCEMENT_FEED_URL =
  'http://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml';

/** The feed's `methodId` for e-bidding; it filters the feed, and is checked again per item. */
export const FEED_E_BIDDING_METHOD_ID = '16';

/**
 * What a sweep asks the feed for: the draft TOR put out for comment (B0), the
 * earliest sign of a tender, and the invitation to bid (D0), when bidding opens.
 * Both carry the project id; a cancellation or award is not asked for here,
 * because the timeline (greenBook) is what keeps each project's status.
 */
export const FEED_ANNOUNCEMENT_TYPES = ['B0', 'D0'] as const;
export type FeedAnnouncementType = (typeof FEED_ANNOUNCEMENT_TYPES)[number];

/** The most items the feed returns for one call; `countbyday` says how many there really were. */
export const FEED_ITEM_CAP = 20;

/**
 * How far back, ending today, Discovery accumulates: a year, so the queue holds
 * closed tenders as well as open ones (owner's decision, 2026-10-06). Each day
 * costs one request per agency per type, so the year is read gradually; see
 * `FEED_BACKFILL_REQUESTS_PER_RUN`.
 */
export const FEED_HISTORY_DAYS = 365;

/**
 * How many requests a Run may spend reading history, after the new days. The
 * site refused after about 110 requests in one window (measured 2026-10-06), and
 * the same Run still has archives to fetch from it, so history takes a share,
 * not all: at this rate a year's history (~3,650 requests) takes about sixty
 * Runs. Raise it once the site's real limit is known.
 */
export const FEED_BACKFILL_REQUESTS_PER_RUN = 60;

/**
 * The Source Registry as the feed knows it: each agency's e-GP department id,
 * and the name stored for it. The open-data `dept_code` is not always the id
 * the feed answers to (measured 2026-10-06): DGA answers as 1108, not 0136, and
 * the ministry's `11` is an aggregate the feed gives nothing for, so it is read
 * as its own office, 1102. Agencies under the ministry (ONDE, ETDA, DEPA…) are
 * not in the registry, as before.
 */
export const FEED_REGISTRY: ReadonlyArray<{
  registryName: (typeof SOURCE_REGISTRY)[number];
  deptId: string;
  deptName: string;
}> = [
  { registryName: 'กรมศุลกากร', deptId: '0305', deptName: 'กรมศุลกากร' },
  {
    registryName: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
    deptId: '1108',
    deptName: 'สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)',
  },
  {
    registryName: 'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
    deptId: '1102',
    deptName: 'สำนักงานปลัดกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
  },
  { registryName: 'กรมสรรพากร', deptId: '0307', deptName: 'กรมสรรพากร' },
  { registryName: 'กรุงเทพมหานคร', deptId: '3100001', deptName: 'กรุงเทพมหานคร' },
];

/**
 * The competitive tender method. TOR availability tracks this almost perfectly
 * (32/32 retrievable for e-bidding, 0/5 for direct award) because the TOR is an
 * attachment to a competitive announcement — a direct award publishes no spec
 * because there are no bidders to spec for.
 */
export const E_BIDDING_METHOD = 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)';

/**
 * gprocurement.go.th's robots.txt is `Disallow: /`. The project owner
 * authorised this research retrieval, so the client stays conspicuously
 * low-impact: single-threaded, seconds between projects, few retries, and it
 * aborts the whole run rather than pushing through a rate limit.
 */
export const POLITENESS = {
  /** Between open-data API calls, which is a public bulk API and tolerant. */
  openDataDelayMs: 400,
  /** Between e-GP project retrievals — randomised in this range. */
  torDelayMsRange: [4000, 6000] as const,
  maxRetries: 2,
  /** Backoff before retry 1 and retry 2 respectively. */
  retryBackoffMs: [5000, 15000] as const,
  openDataTimeoutMs: 30_000,
  /** Archives run to ~30 MB over a slow origin. */
  torTimeoutMs: 120_000,
} as const;

/** Transport failures before a record is abandoned (ADR-0006); the number lives in `@torfun/types`. */
export { MAX_RETRIEVAL_ATTEMPTS as MAX_ATTEMPTS } from '@torfun/types';

/**
 * PDFs of one archive read by Gemini at the same time. Only analysis is pooled;
 * the site downloads stay one at a time (see POLITENESS).
 */
export const ANALYSIS_CONCURRENCY = 2;

/** Longest one record may take before it is requeued; the number lives in `@torfun/types`. */
export { RECORD_DEADLINE_MS } from '@torfun/types';

/**
 * How long a record may sit in Processing with no status change before the next
 * run treats its worker as dead. Twice the record deadline, so a live run is
 * never mistaken for a dead one.
 */
export const STALE_PROCESSING_MS = 10 * 60_000;

/**
 * The site rejects a bare fetch/undici User-Agent. An ordinary desktop browser
 * UA is sufficient — no cookies, no referer, no token.
 */
export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: '*/*',
};

/**
 * Canonical naming convention first, then a fallback for archives that ship a
 * bare `TOR.pdf` (observed on BMA project 66059313551). Which one matched is
 * recorded on the extracted file.
 */
export const TOR_MEMBER_PATTERNS = [
  { label: 'canonical' as const, pattern: /(^|\/)Attach_TOR_[^/]*\.pdf$/i },
  { label: 'loose' as const, pattern: /(^|\/)[^/]*TOR[^/]*\.pdf$/i },
];

/**
 * A discovery sweep younger than this is not repeated. A sweep asks only about
 * the days it has not read, plus today and a share of history, so repeating it
 * spends requests on the same site the downloads use for little news. Six hours
 * matches the shortest Schedule, so every scheduled Run sweeps; a full day would
 * skip the next day's Run whenever it started a few seconds early.
 */
export const DISCOVERY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
