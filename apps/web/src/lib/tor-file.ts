/**
 * The original TOR PDF as a file in the user's hands.
 *
 * Three screens offer the download, and each used to build its own object URL,
 * anchor and click, trusting whatever `Content-Type` the API happened to send.
 * The bytes come from an agency archive and are untrusted, so the type is
 * decided here, once, from the content itself (ASVS V3.2.1: never let the
 * browser interpret a response in a context it was not meant for).
 */

export const PDF_MIME = 'application/pdf';

/** A PDF's `%PDF-` header may be preceded by junk, but only within the first KiB. */
const HEADER_WINDOW = 1024;

/** Whether the bytes are a PDF by signature, whatever label they arrived under. */
export function isPdf(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, HEADER_WINDOW));
  let text = '';
  for (const byte of head) text += String.fromCharCode(byte);
  return text.includes('%PDF-');
}

/**
 * A name for the saved file. Project ids come from the upstream feed, so only a
 * conservative set of characters is kept; the browser would sanitise it anyway,
 * but the name should not depend on that.
 */
export function torFilename(projectId: string): string {
  return `tor-${projectId.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
}

/** Hands an object URL the caller owns to the browser as a download. */
export function triggerDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

/** Saves a blob as a file and releases its object URL straight away. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
