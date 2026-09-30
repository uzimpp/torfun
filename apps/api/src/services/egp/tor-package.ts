import { egpGet, UpstreamError } from './client';
import { BROWSER_HEADERS, TOR_DOWNLOAD_URL, TOR_INFO_URL, TOR_MEMBER_PATTERNS } from './constants';

/**
 * Stage 2 of the pipeline: resolve a project id to its announcement archive and
 * pull the TOR document out of it. Ported from the Python POC's
 * download_tor.py, since removed; see docs/poc_fullflow/README.md.
 *
 * The two-call chain, verified end-to-end with plain curl and no browser:
 *
 *   1. GET infoProcureDocAnnounZip?projectId=<11-digit id>  -> JSON, data.zipId
 *   2. GET downloadFileTest?fileId=<zipId>                  -> the ZIP bytes
 *
 * Details learned the hard way — do not "simplify" these away:
 *   - fileId MUST be data.zipId. data.buildName2 is a UUID that looks like an
 *     equally plausible handle but returns E4514 "ค้นหาไฟล์เอกสารไม่พบ".
 *   - Use infoProcureDocAnnounZip, not the ...ZipTemp variant, which is the
 *     legacy path and returns a smaller draft archive.
 *   - A null data / absent zipId means "this project published no TOR package".
 *     That is a real answer, not a transport error, and is classified as such.
 */

interface InfoResponse {
  response?: string;
  data?: { zipId?: string } | null;
}

/**
 * Step 1. Returns null when the project simply has no published TOR package —
 * the common case for direct awards, which have no bidders to publish a spec for.
 */
export async function resolveZipId(
  projectId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await egpGet(TOR_INFO_URL, { projectId }, BROWSER_HEADERS, signal);

  let body: InfoResponse;
  try {
    body = (await response.json()) as InfoResponse;
  } catch {
    throw new UpstreamError(`Non-JSON response from the TOR info endpoint for ${projectId}`);
  }

  return body.data?.zipId ?? null;
}

/**
 * Step 2. Returns the raw archive bytes.
 *
 * The endpoint answers errors with HTTP 200 and a JSON body, so the content
 * type and the PK magic number are both checked — trusting the status code
 * alone would write an error message to disk as though it were an archive.
 */
export async function downloadArchive(zipId: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await egpGet(TOR_DOWNLOAD_URL, { fileId: zipId }, BROWSER_HEADERS, signal);
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const bytes = new Uint8Array(await response.arrayBuffer());

  const looksLikeZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!contentType.includes('zip') && !looksLikeZip) {
    const preview = new TextDecoder().decode(bytes.slice(0, 200));
    throw new UpstreamError(
      `Expected a zip for fileId=${zipId}, got content-type=${contentType} body=${preview}`,
    );
  }

  return bytes;
}

/**
 * Zip-slip guard: reject absolute paths, Windows drive letters, and any
 * component that walks upward. Applied before ANY member is read or written.
 */
export function isSafeMember(name: string): boolean {
  if (!name || name.endsWith('/')) return false;
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return false;
  return !normalized.split('/').includes('..');
}

/**
 * A candidate PDF pulled out of an archive, with its bytes.
 *
 * Internal to this stage rather than a shared domain type: the payload is
 * carried only as far as classification and never persisted (ADR-0002). What
 * survives on a Procurement is the `ArchiveDocument` manifest entry built from
 * the classification result.
 */
export interface ExtractedPdf {
  member: string;
  filename: string;
  bytes: number;
  /**
   * `unlabelled` is a PDF whose name says nothing either way, sent only because
   * the archive had no TOR-named file. The model, not the name, decides what it is.
   */
  namePattern: 'canonical' | 'loose' | 'unlabelled';
  /** The PDF itself. Held in memory only for the length of one retrieval. */
  payload: Uint8Array;
}

/** Which TOR naming convention a member matched, or null if it isn't a TOR. */
export function matchTorMember(name: string): ExtractedPdf['namePattern'] | null {
  const normalized = name.replace(/\\/g, '/');
  return TOR_MEMBER_PATTERNS.find((entry) => entry.pattern.test(normalized))?.label ?? null;
}

/**
 * Members every announcement archive carries whether or not it has a TOR: the
 * quotation and bond forms, the bidding document and its definitions, the
 * contract template, the announcement itself, and the project's own `doc_*`
 * record. Six real archives shared exactly this set. They are never worth a
 * model call, so they are what "unlabelled" is measured against.
 */
const BOILERPLATE_MEMBER_PATTERNS = [
  /^quotation/i,
  /bond\.pdf$/i,
  /^definition_\d+/i,
  /^document part\s*\d+/i,
  /^bidding no[a-z]*tice/i,
  /^domestic material/i,
  /^contract_\d+/i,
  /^annoudoc_/i,
  /^attach_pub_/i,
  /^doc_\d+_\d+/i,
];

/** Each unlabelled candidate costs a model call, so only a few are ever sent. */
export const MAX_UNLABELLED_CANDIDATES = 4;

function basename(member: string): string {
  return member.replace(/\\/g, '/').split('/').pop() ?? member;
}

function isUnlabelledPdf(member: string): boolean {
  const name = basename(member);
  return /\.pdf$/i.test(name) && !BOILERPLATE_MEMBER_PATTERNS.some((pattern) => pattern.test(name));
}

export interface ExtractionResult {
  torFiles: ExtractedPdf[];
  /** Every member name in the archive, for provenance and admin inspection. */
  members: string[];
  /** Members that matched a TOR pattern but were rejected by the path guard. */
  unsafeSkipped: string[];
}

/**
 * Pull the TOR PDFs out of an archive.
 *
 * Only TOR-named members are extracted — everything else the archive carries
 * (annoudoc_*.pdf, Attach_PUB_*.pdf, bonds, contracts, quotations) is listed
 * but ignored by this stage. Output names are flattened to the basename, which
 * is safe because every member has already passed the path guard.
 *
 * `unzipSync` comes from the caller so this function stays free of a hard
 * dependency on any one zip implementation.
 */
export function extractTorPdfs(
  archive: Uint8Array,
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>,
): ExtractionResult {
  const entries = unzipSync(archive);
  const members = Object.keys(entries);

  const torFiles: ExtractedPdf[] = [];
  const unsafeSkipped: string[] = [];

  const take = (member: string, namePattern: ExtractedPdf['namePattern']) => {
    if (!isSafeMember(member)) {
      unsafeSkipped.push(member);
      return;
    }
    const payload = entries[member];
    if (!payload) return;

    torFiles.push({
      member,
      filename: basename(member),
      bytes: payload.length,
      namePattern,
      payload,
    });
  };

  for (const member of members) {
    const namePattern = matchTorMember(member);
    if (namePattern !== null) take(member, namePattern);
  }

  // A TOR is not always named like one: real archives have held it as
  // `20240823082250355.pdf` or `sit.pdf`. With no TOR-named file, send the PDFs
  // that are not the usual boilerplate and let the model say what they are.
  // Not done when a TOR-named file exists — that is what the name patterns are for.
  if (torFiles.length === 0 && unsafeSkipped.length === 0) {
    for (const member of members.filter(isUnlabelledPdf).slice(0, MAX_UNLABELLED_CANDIDATES)) {
      take(member, 'unlabelled');
    }
  }

  return { torFiles, members, unsafeSkipped };
}
