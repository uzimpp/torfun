import { describe, expect, mock, test } from 'bun:test';
import type { InvitationReading } from '../vertex/invitation-reader';
import { readInvitationDocuments } from './invitation';
import type { ExtractedPdf, InvitationPdfs } from './tor-package';

const pdf = (filename: string): ExtractedPdf => ({
  member: filename,
  filename,
  bytes: filename.length,
  namePattern: 'unlabelled',
  payload: new TextEncoder().encode(`%PDF ${filename}`),
});

const INVITATION = pdf('annoudoc_1_66099189191.pdf');
const BIDDING = pdf('doc_1_66099189191.pdf');

const read = (bidAt: string | null): InvitationReading => ({ bidAt });
const broken: InvitationReading = { ...read(null), unreadable: 'not a PDF' };

/** Reads each file by name, so a test says which document gave which answer. */
function sources(found: InvitationPdfs, answers: Record<string, InvitationReading>) {
  const readCall = mock(async (bytes: Buffer) => {
    const name = [INVITATION, BIDDING].find((p) => Buffer.from(p.payload).equals(bytes))?.filename;
    return answers[name!] ?? read(null);
  });
  return { extract: () => found, read: readCall };
}

describe('readInvitationDocuments', () => {
  test('reads the invitation for the bid date and lists it in the manifest', async () => {
    const result = await readInvitationDocuments(
      sources(
        { invitation: INVITATION, biddingDocument: null },
        { [INVITATION.filename]: read('2026-10-20T09:30:00.000Z') },
      ),
      new Uint8Array(),
      '66099189191',
    );

    expect(result.bidAt).toBe('2026-10-20T09:30:00.000Z');
    expect(result.documents.map((d) => [d.filename, d.role])).toEqual([
      [INVITATION.filename, 'invitation'],
    ]);
  });

  test('never reads the bidding document when the invitation was readable', async () => {
    const s = sources(
      { invitation: INVITATION, biddingDocument: BIDDING },
      { [INVITATION.filename]: read(null) },
    );
    const result = await readInvitationDocuments(s, new Uint8Array(), '66099189191');

    expect(s.read).toHaveBeenCalledTimes(1);
    expect(result.bidAt).toBeNull();
    expect(result.documents.map((d) => d.filename)).toEqual([INVITATION.filename]);
  });

  test('falls back to the bidding document when the archive has no invitation', async () => {
    const result = await readInvitationDocuments(
      sources(
        { invitation: null, biddingDocument: BIDDING },
        { [BIDDING.filename]: read('2026-10-21T00:00:00.000Z') },
      ),
      new Uint8Array(),
      '66099189191',
    );

    expect(result.bidAt).toBe('2026-10-21T00:00:00.000Z');
    expect(result.documents.map((d) => [d.filename, d.role])).toEqual([
      [BIDDING.filename, 'bidding_document'],
    ]);
  });

  test('falls back when the invitation is unreadable, and says why it was not used', async () => {
    const result = await readInvitationDocuments(
      sources(
        { invitation: INVITATION, biddingDocument: BIDDING },
        { [INVITATION.filename]: broken, [BIDDING.filename]: read('2026-10-21T00:00:00.000Z') },
      ),
      new Uint8Array(),
      '66099189191',
    );

    expect(result.bidAt).toBe('2026-10-21T00:00:00.000Z');
    expect(result.documents.map((d) => [d.filename, d.role])).toEqual([
      [INVITATION.filename, 'unreadable'],
      [BIDDING.filename, 'bidding_document'],
    ]);
    expect(result.documents[0]?.note).toBe('not a PDF');
  });

  test('has no date and no documents when the archive carries neither', async () => {
    const s = sources({ invitation: null, biddingDocument: null }, {});

    expect(await readInvitationDocuments(s, new Uint8Array(), '1')).toEqual({
      documents: [],
      bidAt: null,
    });
    expect(s.read).not.toHaveBeenCalled();
  });
});
