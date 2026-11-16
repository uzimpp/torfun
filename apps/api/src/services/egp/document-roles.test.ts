import { describe, expect, test } from 'bun:test';
import { assignDocumentRoles, invitationRoleOf, type ClassifiedDocument } from './document-roles';

/** A candidate as it arrives from per-file classification. */
function candidate(overrides: Partial<ClassifiedDocument> = {}): ClassifiedDocument {
  return {
    member: 'Attach_TOR_1.pdf',
    filename: 'Attach_TOR_1.pdf',
    bytes: 1_000_000,
    namePattern: 'canonical',
    isTor: true,
    torKind: 'final',
    whatThisIs: 'ขอบเขตของงาน',
    ...overrides,
  };
}

const roleOf = (result: ReturnType<typeof assignDocumentRoles>, filename: string) =>
  result.documents.find((d) => d.filename === filename)?.role;

describe('assignDocumentRoles', () => {
  test('a lone final TOR is the main TOR', () => {
    const result = assignDocumentRoles([candidate()]);

    expect(result.mainTor?.filename).toBe('Attach_TOR_1.pdf');
    expect(result.ambiguous).toBe(false);
  });

  test('a final TOR beats a draft shipped alongside it', () => {
    const result = assignDocumentRoles([
      candidate({ member: 'ร่างTOR.pdf', filename: 'ร่างTOR.pdf', torKind: 'draft' }),
      candidate({ member: 'Attach_TOR_9.pdf', filename: 'Attach_TOR_9.pdf', torKind: 'final' }),
    ]);

    expect(result.mainTor?.filename).toBe('Attach_TOR_9.pdf');
    expect(roleOf(result, 'ร่างTOR.pdf')).toBe('tor_variant');
    expect(result.ambiguous).toBe(false);
  });

  test('a draft is still the best available reading when no final was published', () => {
    // Agencies publish a ร่าง for comment at the drafting_tor stage. That is the
    // document to read; the record just has to say what it is.
    const result = assignDocumentRoles([
      candidate({ member: 'ร่างTOR.pdf', filename: 'ร่างTOR.pdf', torKind: 'draft' }),
    ]);

    expect(result.mainTor?.filename).toBe('ร่างTOR.pdf');
    expect(result.mainTor?.note).toContain('draft');
  });

  test('a file that is not a TOR is never the main TOR, however it is named', () => {
    // Verified false positives of the loose filename pattern: both contain "TOR".
    const result = assignDocumentRoles([
      candidate({
        member: 'CONTRACTOR.pdf',
        filename: 'CONTRACTOR.pdf',
        namePattern: 'loose',
        isTor: false,
        torKind: null,
        whatThisIs: 'หนังสือรับรองผู้รับจ้าง',
      }),
    ]);

    expect(result.mainTor).toBeNull();
    expect(roleOf(result, 'CONTRACTOR.pdf')).toBe('not_tor');
    expect(result.ambiguous).toBe(false);
  });

  test('two finals are resolved by naming convention and flagged as ambiguous', () => {
    const result = assignDocumentRoles([
      candidate({ member: 'TOR.pdf', filename: 'TOR.pdf', namePattern: 'loose', bytes: 9_000_000 }),
      candidate({ member: 'Attach_TOR_2.pdf', filename: 'Attach_TOR_2.pdf', bytes: 100_000 }),
    ]);

    // Convention beats size: a canonical name is the agency's own designation.
    expect(result.mainTor?.filename).toBe('Attach_TOR_2.pdf');
    // But the pipeline guessed, and an administrator must be able to see that.
    expect(result.ambiguous).toBe(true);
  });

  test('equally-named finals fall back to size, still ambiguous', () => {
    const result = assignDocumentRoles([
      candidate({ member: 'Attach_TOR_lot1.pdf', filename: 'Attach_TOR_lot1.pdf', bytes: 200_000 }),
      candidate({ member: 'Attach_TOR_lot2.pdf', filename: 'Attach_TOR_lot2.pdf', bytes: 800_000 }),
    ]);

    expect(result.mainTor?.filename).toBe('Attach_TOR_lot2.pdf');
    expect(result.ambiguous).toBe(true);
  });

  test('a document that could not be read is recorded, not dropped', () => {
    const result = assignDocumentRoles([
      candidate({
        member: 'huge.pdf',
        filename: 'huge.pdf',
        bytes: 40_000_000,
        isTor: false,
        torKind: null,
        unreadable: 'Exceeds the 15MB limit for a document sent to Gemini.',
      }),
    ]);

    expect(roleOf(result, 'huge.pdf')).toBe('unreadable');
    expect(result.mainTor).toBeNull();
  });
});

describe('how each document was read', () => {
  test('a partial reading is recorded on the manifest entry, with what was lost', () => {
    const result = assignDocumentRoles([
      candidate({ readMode: 'first_pages', readNote: 'อ่านเฉพาะ 30 หน้าแรกจากทั้งหมด 120 หน้า' }),
    ]);

    expect(result.documents[0]?.readMode).toBe('first_pages');
    expect(result.documents[0]?.readNote).toBe('อ่านเฉพาะ 30 หน้าแรกจากทั้งหมด 120 หน้า');
  });

  test('a whole-PDF reading adds no note, and leaves no key behind for the database to store as null', () => {
    const entry = assignDocumentRoles([candidate({ readMode: 'pdf' })]).documents[0];

    expect(entry?.readMode).toBe('pdf');
    expect(entry).not.toHaveProperty('readNote');
  });
});

describe('invitationRoleOf', () => {
  const projectId = '69049012345';

  test('annoudoc_<digits>_<projectId>.pdf is the invitation', () => {
    expect(invitationRoleOf(`annoudoc_1234567_${projectId}.pdf`, projectId)).toBe('invitation');
  });

  test('doc_<digits>_<projectId>.pdf is the bidding document', () => {
    expect(invitationRoleOf(`doc_7654321_${projectId}.pdf`, projectId)).toBe('bidding_document');
  });

  test('a folder in the member path does not matter', () => {
    expect(invitationRoleOf(`pack/annoudoc_1_${projectId}.PDF`, projectId)).toBe('invitation');
  });

  test('another project\'s file is not ours', () => {
    expect(invitationRoleOf('annoudoc_1234567_69049099999.pdf', projectId)).toBeNull();
  });

  test('lookalikes are not matched', () => {
    for (const name of [
      `annoudoc_${projectId}.pdf`,
      `annoudoc_1_${projectId}.docx`,
      `old_annoudoc_1_${projectId}.pdf`,
      `bidding noltice.pdf`,
      `Attach_TOR_1.pdf`,
    ]) {
      expect(invitationRoleOf(name, projectId)).toBeNull();
    }
  });
});
