import { describe, expect, test } from 'bun:test';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { createOversizeReaders, looksReadable } from './oversize-readers';

const THAI_PARAGRAPH =
  'ขอบเขตของงานจ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน ผู้รับจ้างต้องพัฒนาเว็บแอปพลิเคชันและฐานข้อมูล ' +
  'พร้อมทั้งฝึกอบรมเจ้าหน้าที่และส่งมอบคู่มือการใช้งานภายในหนึ่งร้อยแปดสิบวันนับจากวันลงนามในสัญญา ';

describe('looksReadable', () => {
  test('accepts a real stretch of Thai text', () => {
    expect(looksReadable(THAI_PARAGRAPH.repeat(4))).toBe(true);
  });

  test('accepts a real stretch of English text', () => {
    expect(looksReadable('The contractor shall develop a web application. '.repeat(20))).toBe(true);
  });

  test('rejects the few stray characters a scanned document yields', () => {
    expect(looksReadable('1 2 3 ก ข')).toBe(false);
    expect(looksReadable('')).toBe(false);
  });

  test('rejects Thai that came out as private-use glyphs, a font-encoding failure', () => {
    // Legacy Thai fonts map tone marks and vowels into U+F700-F7FF; text that is
    // full of them reads as nonsense however long it is.
    const garbled = THAI_PARAGRAPH.repeat(4)
      .split('')
      .map((char, index) => (index % 12 === 0 ? '' : char))
      .join('');

    expect(looksReadable(garbled)).toBe(false);
  });

  test('rejects text full of replacement characters', () => {
    expect(looksReadable('�'.repeat(500))).toBe(false);
  });
});

/** A PDF of `pages` pages, each carrying `kbPerPage` of incompressible payload, optionally with text. */
async function makePdf(options: { pages: number; kbPerPage: number; text?: string }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < options.pages; index += 1) {
    const page = doc.addPage();
    if (options.text) {
      options.text
        .split('\n')
        .forEach((line, row) => page.drawText(line, { x: 20, y: 800 - row * 14, size: 10, font }));
    }
    const payload = new Uint8Array(options.kbPerPage * 1024).map(() =>
      Math.floor(Math.random() * 256),
    );
    page.node.set(PDFName.of('Payload'), doc.context.register(doc.context.stream(payload)));
  }
  return Buffer.from(await doc.save());
}

describe('the real readers', () => {
  const readers = createOversizeReaders();

  test('firstPages cuts a large document down to the most pages that fit', async () => {
    const pdf = await makePdf({ pages: 40, kbPerPage: 300 }); // about 12 MB
    const limit = 3 * 1024 * 1024;

    const cut = await readers.firstPages(pdf, limit);

    expect(cut).not.toBeNull();
    expect(cut!.totalPages).toBe(40);
    expect(cut!.pages).toBeGreaterThan(0);
    expect(cut!.pages).toBeLessThan(40);
    expect(cut!.pdf.byteLength).toBeLessThanOrEqual(limit);
    // It is a real PDF with exactly that many pages, and one more would not have fit.
    expect((await PDFDocument.load(cut!.pdf)).getPageCount()).toBe(cut!.pages);
    expect(cut!.pdf.byteLength + 300 * 1024).toBeGreaterThan(limit - 300 * 1024);
  });

  test('firstPages gives up when even one page is too big', async () => {
    const pdf = await makePdf({ pages: 3, kbPerPage: 300 });

    expect(await readers.firstPages(pdf, 50 * 1024)).toBeNull();
  });

  test('extractText returns the text layer of a document that has one', async () => {
    const line =
      'The contractor shall develop and deliver a web application for the registry office.';
    const pdf = await makePdf({ pages: 3, kbPerPage: 1, text: Array(12).fill(line).join('\n') });

    const text = await readers.extractText(pdf);

    expect(text).toContain('web application');
  });

  test('extractText returns null for a document with no text, as a scan has none', async () => {
    const pdf = await makePdf({ pages: 3, kbPerPage: 50 });

    expect(await readers.extractText(pdf)).toBeNull();
  });

  test('extractText returns null for bytes that are not a PDF, instead of throwing', async () => {
    expect(await readers.extractText(Buffer.from('not a pdf at all'))).toBeNull();
  });
});
