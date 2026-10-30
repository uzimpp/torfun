import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import type { OversizeReaders } from './classify-document';

/**
 * How a TOR over Gemini's inline limit can still be read, without storing the
 * file (ADR-0002) and without OCR.
 *
 * Most large TORs are large because of the images in them, not because they are
 * scans: they were exported from a word processor and so still carry a text
 * layer. That is read directly. Where there is none, the first pages are cut
 * into a smaller PDF and the model reads those — a TOR states its scope up
 * front. True OCR is left out on purpose: Thai OCR on a 50MB scan is slow and
 * worse than the model's own reading.
 */

/** Below this much text, what came out is stray marks, not a document. */
const MIN_TEXT_CHARS = 400;

/** A long TOR is well under this; it only bounds what is sent on a pathological one. */
const MAX_TEXT_CHARS = 400_000;

/**
 * Whether extracted text is worth sending.
 *
 * A scan yields a handful of characters. A document in a legacy Thai font can
 * yield plenty, but as private-use glyphs or replacement characters, which read
 * as nonsense however long they run — so both are refused.
 */
export function looksReadable(text: string): boolean {
  const compact = text.replace(/\s/g, '');
  if (compact.length < MIN_TEXT_CHARS) return false;

  let usable = 0;
  let broken = 0;
  for (const char of compact) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x0e00 && code <= 0x0e7f) || code < 0x80) usable += 1;
    else if ((code >= 0xe000 && code <= 0xf8ff) || code === 0xfffd) broken += 1;
  }

  return broken / compact.length <= 0.02 && usable / compact.length >= 0.85;
}

async function readTextLayer(pdf: Buffer): Promise<string | null> {
  try {
    // A copy: pdf.js may detach the buffer it is given, and the caller still needs it.
    const document = await getDocumentProxy(new Uint8Array(pdf));
    try {
      const { text } = await extractText(document, { mergePages: true });
      const joined = Array.isArray(text) ? text.join('\n') : text;
      return looksReadable(joined) ? joined.slice(0, MAX_TEXT_CHARS) : null;
    } finally {
      // pdf.js keeps the parsed document and its worker alive until told otherwise.
      // unpdf's proxy has no destroy() of its own; the loading task owns it. A
      // failure to clean up must not throw away the text already read.
      await document.loadingTask.destroy().catch(() => {});
    }
  } catch {
    return null;
  }
}

/** A copy of `source` holding its first `count` pages, as bytes. */
async function firstPagesBytes(source: PDFDocument, count: number): Promise<Uint8Array> {
  const cut = await PDFDocument.create();
  const pages = await cut.copyPages(
    source,
    Array.from({ length: count }, (_, index) => index),
  );
  for (const page of pages) cut.addPage(page);
  return cut.save();
}

async function cutFirstPages(pdf: Buffer, maxBytes: number) {
  try {
    const source = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
    const totalPages = source.getPageCount();

    // The most pages that still fit. Size only grows with the page count, so a
    // binary search finds it in a few saves rather than one per page.
    let low = 0;
    let best: Uint8Array | null = null;
    let high = totalPages;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const bytes = await firstPagesBytes(source, middle);
      if (bytes.byteLength <= maxBytes) {
        low = middle;
        best = bytes;
      } else {
        high = middle - 1;
      }
    }

    return best && low > 0 ? { pdf: Buffer.from(best), pages: low, totalPages } : null;
  } catch {
    return null;
  }
}

export function createOversizeReaders(): OversizeReaders {
  return { extractText: readTextLayer, firstPages: cutFirstPages };
}
