import type { ArchiveDocument } from '@torfun/types';
import type { InvitationReading } from '../vertex/invitation-reader';
import type { ExtractedPdf, InvitationPdfs } from './tor-package';

/**
 * Finds the project's invitation announcement in an archive and reads its bid
 * date. The invitation is found by filename (ADR-0003 is amended for these two
 * roles); only if it is missing or unreadable is the bidding document read in
 * its place, and never both.
 */

export interface InvitationSources {
  extract: (archive: Uint8Array, projectId: string) => InvitationPdfs;
  read: (pdf: Buffer) => Promise<InvitationReading>;
}

export interface InvitationResult {
  /** Manifest entries for the documents that were read; empty when there were none. */
  documents: ArchiveDocument[];
  bidAt: string | null;
}

const NOTES = {
  invitation: 'ประกาศเชิญชวน — อ่านเฉพาะวันที่ยื่นข้อเสนอ',
  bidding_document: 'เอกสารประกวดราคา — อ่านเฉพาะวันที่ยื่นข้อเสนอ เพราะไม่มีประกาศเชิญชวนที่อ่านได้',
} as const;

export async function readInvitationDocuments(
  sources: InvitationSources,
  archive: Uint8Array,
  projectId: string,
): Promise<InvitationResult> {
  const { invitation, biddingDocument } = sources.extract(archive, projectId);
  const candidates: Array<[ExtractedPdf | null, keyof typeof NOTES]> = [
    [invitation, 'invitation'],
    [biddingDocument, 'bidding_document'],
  ];

  const documents: ArchiveDocument[] = [];
  for (const [file, role] of candidates) {
    if (!file) continue;
    const reading = await sources.read(
      // A view over the extracted bytes, not a copy.
      Buffer.from(file.payload.buffer, file.payload.byteOffset, file.payload.byteLength),
    );
    documents.push({
      member: file.member,
      filename: file.filename,
      bytes: file.bytes,
      namePattern: file.namePattern,
      role: reading.unreadable === undefined ? role : 'unreadable',
      note: reading.unreadable ?? NOTES[role],
    });
    if (reading.unreadable === undefined) return { documents, bidAt: reading.bidAt };
  }
  return { documents, bidAt: null };
}
