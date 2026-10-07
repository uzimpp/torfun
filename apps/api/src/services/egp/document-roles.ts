import type { ArchiveDocument, DocumentRole } from '@torfun/types';

/**
 * Turns per-file classification results into the document manifest stored on a
 * Procurement, and names which one is the TOR to read.
 *
 * Kept separate from the Vertex adapter because this is policy, not I/O: each
 * document is classified alone (ADR-0003, a consequence of not storing the
 * bytes), so nothing in a single classification can know another candidate
 * exists. Choosing between them happens here, once, over all of them.
 */

/** One candidate PDF, as it comes back from classification. */
export interface ClassifiedDocument {
  member: string;
  filename: string;
  bytes: number;
  /** What the filename heuristic thought. Provenance and tie-breaker only. */
  namePattern: 'canonical' | 'loose';
  isTor: boolean;
  /** `final` where the document presents itself as the issued TOR, `draft` for a ร่าง. */
  torKind: 'final' | 'draft' | null;
  /** What the document actually is, in the model's words. */
  whatThisIs: string;
  /** Set when the document could not be read at all; the reason why. */
  unreadable?: string;
}

export interface RoleAssignment {
  documents: ArchiveDocument[];
  mainTor: ArchiveDocument | null;
  /**
   * True when more than one document had an equal claim and the tie was broken
   * by convention rather than by evidence. Surfaced so an administrator can see
   * that the pipeline chose, rather than discovering it in a bad summary.
   */
  ambiguous: boolean;
}

/** Best claim first: the agency's own naming convention, then substance. */
function strongerClaim(a: ClassifiedDocument, b: ClassifiedDocument): number {
  if (a.namePattern !== b.namePattern) return a.namePattern === 'canonical' ? -1 : 1;
  return b.bytes - a.bytes;
}

function roleFor(document: ClassifiedDocument, main: ClassifiedDocument | null): DocumentRole {
  if (document.unreadable !== undefined) return 'unreadable';
  if (document === main) return 'main_tor';
  return document.isTor ? 'tor_variant' : 'not_tor';
}

function noteFor(document: ClassifiedDocument, main: ClassifiedDocument | null): string {
  if (document.unreadable !== undefined) return document.unreadable;
  if (document === main && document.torKind === 'draft') {
    return `Best available reading: this is a draft (${document.whatThisIs}); no final TOR was published in the archive.`;
  }
  return document.whatThisIs;
}

export function assignDocumentRoles(candidates: ClassifiedDocument[]): RoleAssignment {
  const readable = candidates.filter((c) => c.unreadable === undefined && c.isTor);

  // A published final always outranks a draft. Where an agency published only a
  // ร่าง — normal at the drafting_tor stage — that draft is still the document a
  // Business Development Officer needs, so it is promoted rather than discarded.
  const finals = readable.filter((c) => c.torKind === 'final').sort(strongerClaim);
  const contenders = finals.length > 0 ? finals : readable.sort(strongerClaim);

  const main = contenders[0] ?? null;

  const documents: ArchiveDocument[] = candidates.map((document) => ({
    member: document.member,
    filename: document.filename,
    bytes: document.bytes,
    namePattern: document.namePattern,
    role: roleFor(document, main),
    note: noteFor(document, main),
  }));

  return {
    documents,
    mainTor: documents.find((d) => d.role === 'main_tor') ?? null,
    ambiguous: contenders.length > 1,
  };
}
