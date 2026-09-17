/**
 * Fixed configuration for the e-GP ingestion pipeline.
 *
 * Every value here was established empirically by the Python POC; the reasons
 * are recorded so they don't get "simplified" away. See
 * docs/poc_fullflow/README.md for the full investigation.
 */

/** Open-data API. The `/service/<name>` form is the working one. */
export const OPEN_DATA_BASE = 'https://opend.data.go.th/govspending/service';
export const DEPT_URL = `${OPEN_DATA_BASE}/egp-dept`;
export const CONTRACT_URL = `${OPEN_DATA_BASE}/egp-contract`;

/**
 * e-GP procurement app, used purely as a keyed lookup by project id.
 *
 * These two endpoints need no token, cookie or auth. We deliberately never
 * touch the announcement *search* endpoints, which sit behind a Cloudflare
 * Turnstile bot check, and implement none of the site's client-side
 * generateToken/RDCrypto scheme — discovery comes from the open-data API
 * instead, which is the supported route.
 */
export const TOR_INFO_URL =
  'https://process5.gprocurement.go.th/egp-approval-service/apv-common/infoProcureDocAnnounZip';
export const TOR_DOWNLOAD_URL =
  'https://process5.gprocurement.go.th/egp-upload-service/v1/downloadFileTest';

/**
 * The Source Registry, keyed by the Thai name a human would query with.
 *
 * dept_code is resolved from these at runtime and used only as the internal
 * lookup key, because egp-contract silently ignores a dept_name filter —
 * passing one returns the unfiltered ~3.9M-row total across every agency.
 */
export const SOURCE_REGISTRY = [
  'กรมศุลกากร',
  'สำนักงานพัฒนารัฐบาลดิจิทัล',
  'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
  'กรมสรรพากร',
  'กรุงเทพมหานคร',
] as const;

/** Thai Buddhist fiscal years in scope. */
export const FISCAL_YEARS = [2567, 2568, 2569] as const;

/**
 * Narrow, software-biased keyword set. Deliberately excludes broad terms like
 * "พัฒนาระบบ" and "ระบบบริหารจัดการ", which match road and drainage works as
 * often as software and would flood the queue with false positives.
 */
export const SOFTWARE_KEYWORDS = [
  'ซอฟต์แวร์', // software
  'แอปพลิเคชัน', // application
  'ระบบสารสนเทศ', // information system
  'เว็บไซต์', // website
  'จ้างพัฒนา', // hire-to-develop
] as const;

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

/** egp-contract accepts a limit of at least 500. */
export const PAGE_LIMIT = 500;

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
