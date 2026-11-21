import { UpstreamError } from './client';

/**
 * Resource limits for untrusted archives and downloads (ASVS V5.2.1, V5.2.2,
 * V5.2.3; threat T-09, zip bombs and oversized files).
 *
 * Real TOR archives run to about 30 MB. These ceilings leave a wide margin for
 * scanned PDFs while keeping one hostile archive from taking the process down:
 * fflate allocates each member's output from the size its header *declares*, so
 * capping declared sizes before inflating bounds memory. A deflated member whose
 * header understates its size comes out truncated to that size; a stored member
 * comes out at its compressed length, which the download cap already bounds.
 */
export const ARCHIVE_LIMITS = {
  /** Bytes read from one download before it is abandoned. */
  maxDownloadBytes: 200 * 1024 * 1024,
  /** Entries listed in one archive. A real one has a few dozen. */
  maxEntries: 2_000,
  /** Declared uncompressed size of one member we inflate. */
  maxMemberBytes: 100 * 1024 * 1024,
  /** Declared uncompressed bytes inflated from one archive, all members together. */
  maxTotalInflatedBytes: 300 * 1024 * 1024,
  /**
   * Uncompressed:compressed ratio above which a member is treated as a bomb.
   * PDFs barely compress (ratios near 1); 100:1 is only reached by padding.
   * Applied to members over `ratioFloorBytes`, so tiny files never trip it.
   */
  maxCompressionRatio: 100,
  ratioFloorBytes: 1024 * 1024,
} as const;

export class ArchiveRejectedError extends UpstreamError {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveRejectedError';
  }
}

/**
 * Reads a response body, refusing to hold more than `maxBytes`. A declared
 * Content-Length over the cap is refused before a byte is read; a body that
 * lies about (or omits) its length is cut off once it crosses the cap.
 */
export async function readBodyCapped(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new ArchiveRejectedError(`${label}: Content-Length ${declared} exceeds ${maxBytes}`);
  }
  if (!response.body) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ArchiveRejectedError(`${label}: body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export interface MemberSize {
  /** Compressed bytes in the archive. */
  size: number;
  /** Uncompressed bytes the header declares. */
  originalSize: number;
}

/** Why a member may not be inflated, or null if it may. */
export function memberRejection({ size, originalSize }: MemberSize): string | null {
  if (originalSize > ARCHIVE_LIMITS.maxMemberBytes) {
    return `declares ${originalSize} bytes (limit ${ARCHIVE_LIMITS.maxMemberBytes})`;
  }
  if (
    originalSize > ARCHIVE_LIMITS.ratioFloorBytes &&
    originalSize / Math.max(size, 1) > ARCHIVE_LIMITS.maxCompressionRatio
  ) {
    return `compression ratio ${Math.round(originalSize / Math.max(size, 1))}:1 looks like a zip bomb`;
  }
  return null;
}
