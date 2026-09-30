import { describe, expect, test } from 'bun:test';
import { extractTorPdfs } from './tor-package';

/** A zip of the given member names, each holding a few bytes. */
const zip = (names: string[]) => () =>
  Object.fromEntries(names.map((name) => [name, new Uint8Array([0x25, 0x50, 0x44, 0x46])]));
const extract = (names: string[]) => extractTorPdfs(new Uint8Array(), zip(names));

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
