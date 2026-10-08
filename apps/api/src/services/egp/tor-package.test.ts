import { describe, expect, test } from 'bun:test';
import { unzipSync, zipSync } from 'fflate';
import { extractTorPdfs } from './tor-package';

/** A zip of the given member names, each holding a few bytes. */
const zip = (names: string[]) =>
  zipSync(
    Object.fromEntries(names.map((name) => [name, new Uint8Array([0x25, 0x50, 0x44, 0x46])])),
  );
const extract = (names: string[]) => extractTorPdfs(zip(names));

/** What every archive carries, whether or not it has a TOR — seen in six real ones. */
const BOILERPLATE = [
  'quotation.pdf',
  'Bid Bond.pdf',
  'Performance Bond.pdf',
  'Advance Payment Bond.pdf',
  'Retention Bond.pdf',
  'definition_1.pdf',
  'definition_2.pdf',
  'Document Part1.pdf',
  'Document Part2.pdf',
  'bidding noltice.pdf',
  'Domestic material use plan.pdf',
  'action_plan.xlsx',
  'contract_06.pdf',
  'doc_310000110000077_66099189191.pdf',
  'annoudoc_310000110000077_66099189191.pdf',
];

describe('extractTorPdfs', () => {
  test('a TOR-named file is the candidate, and unlabelled ones are not sent alongside it', () => {
    const { torFiles } = extract([...BOILERPLATE, 'Attach_TOR_1.pdf', 'sit.pdf']);

    expect(torFiles.map((file) => [file.filename, file.namePattern])).toEqual([
      ['Attach_TOR_1.pdf', 'canonical'],
    ]);
  });

  test('with no TOR-named file, the unlabelled PDFs become candidates for the model to judge', () => {
    const { torFiles } = extract([
      ...BOILERPLATE,
      '20240823082250355.pdf',
      '20240823082037630.pdf',
    ]);

    expect(torFiles.map((file) => [file.filename, file.namePattern])).toEqual([
      ['20240823082250355.pdf', 'unlabelled'],
      ['20240823082037630.pdf', 'unlabelled'],
    ]);
  });

  test('the boilerplate every archive carries is never a candidate', () => {
    expect(extract(BOILERPLATE).torFiles).toEqual([]);
  });

  test('odd names seen in real archives are candidates, not boilerplate', () => {
    const names = ['sit.pdf', 'Scanned-image06-20-2025-155535.pdf', 'doc03297620230912143425.pdf'];

    expect(extract([...BOILERPLATE, ...names]).torFiles.map((file) => file.filename)).toEqual(
      names,
    );
  });

  test('at most four unlabelled files are sent, since each costs a model call', () => {
    const many = ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf', 'f.pdf'];

    expect(extract(many).torFiles.map((file) => file.filename)).toEqual([
      'a.pdf',
      'b.pdf',
      'c.pdf',
      'd.pdf',
    ]);
  });

  test('an unsafe path is reported and never extracted, candidate or not', () => {
    const { torFiles, unsafeSkipped } = extract(['../../etc/passwd.pdf', 'ok.pdf']);

    expect(torFiles.map((file) => file.filename)).toEqual(['ok.pdf']);
    expect(unsafeSkipped).toEqual(['../../etc/passwd.pdf']);
  });

  test('every member name is returned, so an administrator can see what was there', () => {
    expect(extract([...BOILERPLATE, 'sit.pdf']).members).toHaveLength(BOILERPLATE.length + 1);
  });
});

describe('extractTorPdfs on a real archive', () => {
  /** A zip whose `name` entry has had its compressed bytes ruined, so inflating it throws. */
  function withRuinedEntry(files: Record<string, Uint8Array>, name: string): Uint8Array {
    const archive = zipSync(files);
    const nameAt = Buffer.from(archive).indexOf(Buffer.from(name));
    const view = new DataView(archive.buffer, archive.byteOffset);
    const dataAt = nameAt + view.getUint16(nameAt - 4, true) + view.getUint16(nameAt - 2, true);
    archive.fill(0xff, dataAt, dataAt + 16);
    return archive;
  }

  test('only the members it will use are inflated; the rest are listed, not read', () => {
    const tor = new Uint8Array(2000).fill(0x41);
    const archive = withRuinedEntry(
      { 'Attach_TOR_1.pdf': tor, 'bulk_data.bin': new Uint8Array(5000).fill(0x42) },
      'bulk_data.bin',
    );
    expect(() => unzipSync(archive)).toThrow();

    const { torFiles, members } = extractTorPdfs(archive);

    expect(members).toEqual(['Attach_TOR_1.pdf', 'bulk_data.bin']);
    expect(torFiles.map((file) => [file.filename, file.bytes])).toEqual([
      ['Attach_TOR_1.pdf', 2000],
    ]);
  });
});
