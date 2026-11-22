import { afterEach, describe, expect, test } from 'bun:test';
import { zipSync } from 'fflate';
import { ARCHIVE_LIMITS, ArchiveRejectedError, readBodyCapped } from './archive-limits';
import {
  downloadArchive,
  extractInvitationPdfs,
  extractTorPdfs,
  inflateChosen,
  withinBudget,
} from './tor-package';

/** Threat T-09 (malicious archives); ASVS V5.2.1, V5.2.2, V5.2.3. */

/** Rewrites a single-member zip's declared uncompressed size, as a hostile archive would. */
function forgeDeclaredSize(zip: Uint8Array, declared: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  view.setUint32(22, declared, true); // local file header
  for (let i = out.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, declared, true); // central directory
      break;
    }
  }
  return out;
}

/**
 * Writes a zip by hand, which `zipSync` cannot: one stored local record and any
 * number of central-directory entries pointing at it, each with its own name
 * and declared uncompressed size. Repeated names and overlapping entries are
 * both things a hostile archive can carry.
 */
function rawStoredZip(
  data: Uint8Array,
  central: Array<{ name: string; originalSize?: number }>,
): Uint8Array {
  const enc = new TextEncoder();
  const localName = enc.encode(central[0]?.name ?? 'x');
  const parts: Uint8Array[] = [];
  const header = (length: number, fill: (view: DataView) => void, tail: Uint8Array) => {
    const bytes = new Uint8Array(length + tail.length);
    fill(new DataView(bytes.buffer));
    bytes.set(tail, length);
    parts.push(bytes);
    return bytes.length;
  };

  let offset = header(
    30,
    (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(4, 20, true);
      v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true);
      v.setUint16(26, localName.length, true);
    },
    localName,
  );
  parts.push(data);
  offset += data.length;

  let directorySize = 0;
  for (const entry of central) {
    const name = enc.encode(entry.name);
    directorySize += header(
      46,
      (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint32(20, data.length, true);
        v.setUint32(24, entry.originalSize ?? data.length, true);
        v.setUint16(28, name.length, true);
        v.setUint32(42, 0, true); // every entry shares the one local record
      },
      name,
    );
  }
  header(
    22,
    (v) => {
      v.setUint32(0, 0x06054b50, true);
      v.setUint16(8, Math.min(central.length, 0xffff), true);
      v.setUint16(10, Math.min(central.length, 0xffff), true);
      v.setUint32(12, directorySize, true);
      v.setUint32(16, offset, true);
    },
    new Uint8Array(0),
  );

  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const MiB = 1024 * 1024;
const noisy = (length: number) => new Uint8Array(length).map((_, i) => (i * 7919) % 251);

describe('duplicate and overlapping members', () => {
  test('the hand-written zip helper produces an archive that extracts normally', () => {
    const pdf = noisy(4096);
    const result = extractTorPdfs(rawStoredZip(pdf, [{ name: 'Attach_TOR_1.pdf' }]));
    expect(result.members).toEqual(['Attach_TOR_1.pdf']);
    expect(result.torFiles[0]?.payload).toEqual(pdf);
  });

  test('an archive that repeats a member name is refused', () => {
    const archive = rawStoredZip(
      noisy(4096),
      Array.from({ length: 50 }, () => ({ name: 'Attach_TOR_1.pdf' })),
    );
    expect(() => extractTorPdfs(archive)).toThrow(ArchiveRejectedError);
    expect(() => extractTorPdfs(archive)).toThrow(/Attach_TOR_1\.pdf more than once/);
    expect(() =>
      extractInvitationPdfs(
        rawStoredZip(
          noisy(4096),
          Array.from({ length: 50 }, () => ({ name: 'annoudoc_67019000001.pdf' })),
        ),
        '67019000001',
      ),
    ).toThrow(ArchiveRejectedError);
  });

  test('tens of thousands of entries under one chosen name are refused without inflating', () => {
    const archive = rawStoredZip(
      noisy(64 * 1024),
      Array.from({ length: 30_000 }, () => ({ name: 'Attach_TOR_1.pdf', originalSize: 90 * MiB })),
    );
    const started = performance.now();
    expect(() => extractTorPdfs(archive)).toThrow(ArchiveRejectedError);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('overlapping entries under different names are each charged to the budget', () => {
    // Four names over the same 1 MiB record, each declaring 90 MiB: three fit
    // the 300 MiB budget, the fourth does not.
    const archive = rawStoredZip(
      noisy(MiB),
      [1, 2, 3, 4].map((n) => ({ name: `Attach_TOR_${n}.pdf`, originalSize: 90 * MiB })),
    );
    const result = extractTorPdfs(archive);
    expect(result.torFiles.map((pdf) => pdf.member)).toEqual([
      'Attach_TOR_1.pdf',
      'Attach_TOR_2.pdf',
      'Attach_TOR_3.pdf',
    ]);
    expect(result.oversizeSkipped[0]).toContain('Attach_TOR_4.pdf (would exceed');
  });

  test('the inflate pass charges each entry it inflates and refuses past the budget', () => {
    // Called without the listing pass's budget, as if the two passes disagreed.
    const names = [1, 2, 3, 4].map((n) => `Attach_TOR_${n}.pdf`);
    const archive = rawStoredZip(
      noisy(MiB),
      names.map((name) => ({ name, originalSize: 90 * MiB })),
    );
    const chosen = new Map(names.map((name) => [name, 'canonical' as const]));
    expect(() => inflateChosen(archive, chosen, (tag) => tag)).toThrow(/inflate budget/);
    expect(inflateChosen(archive, new Map([...chosen].slice(0, 3)), (tag) => tag)).toHaveLength(3);
  });

  test('a stored member is charged at its compressed size when that is larger', () => {
    const stored = { size: 120 * MiB, originalSize: 1 };
    const sizes = new Map([
      ['a.pdf', stored],
      ['b.pdf', stored],
      ['c.pdf', stored],
    ]);
    const skipped: string[] = [];
    const kept = withinBudget(new Map([...sizes.keys()].map((k) => [k, k])), sizes, skipped);
    expect([...kept.keys()]).toEqual(['a.pdf', 'b.pdf']);
    expect(skipped[0]).toContain('c.pdf (would exceed');
  });
});

describe('zip bombs and forged headers', () => {
  test('a highly compressed member is listed and reported, never inflated', () => {
    const bomb = zipSync({ 'Attach_TOR_1.pdf': new Uint8Array(8 * 1024 * 1024) }, { level: 9 });
    expect(bomb.length).toBeLessThan(64 * 1024); // 8 MiB of zeros in a few KB

    const result = extractTorPdfs(bomb);

    expect(result.members).toEqual(['Attach_TOR_1.pdf']);
    expect(result.torFiles).toEqual([]);
    expect(result.oversizeSkipped[0]).toMatch(/Attach_TOR_1\.pdf \(compression ratio \d+:1/);
  });

  test('a header declaring 3.9 GB is refused before anything is allocated', () => {
    const small = zipSync({ 'Attach_TOR_1.pdf': new Uint8Array(1024).fill(7) }, { level: 0 });
    const started = performance.now();

    const result = extractTorPdfs(forgeDeclaredSize(small, 0xf0000000));

    expect(result.torFiles).toEqual([]);
    expect(result.oversizeSkipped[0]).toContain('declares 4026531840 bytes');
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('a deflated member whose header understates its size yields only what it declared', () => {
    // (A stored member is returned at its compressed length instead, which the
    // download cap already bounds.)
    const real = zipSync({ 'Attach_TOR_1.pdf': new Uint8Array(4096).fill(1) }, { level: 6 });
    const result = extractTorPdfs(forgeDeclaredSize(real, 100));
    expect(result.torFiles[0]?.bytes ?? 0).toBeLessThanOrEqual(100);
  });

  test('an archive with an absurd number of entries is refused outright', () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i <= ARCHIVE_LIMITS.maxEntries; i += 1) files[`f${i}.txt`] = new Uint8Array(1);
    expect(() => extractTorPdfs(zipSync(files))).toThrow(ArchiveRejectedError);
  });

  test('the per-archive inflate budget stops members once it is spent', () => {
    const big = { size: 80 * 1024 * 1024, originalSize: 90 * 1024 * 1024 };
    const sizes = new Map([
      ['a.pdf', big],
      ['b.pdf', big],
      ['c.pdf', big],
      ['d.pdf', big],
    ]);
    const skipped: string[] = [];
    const kept = withinBudget(new Map([...sizes.keys()].map((k) => [k, k])), sizes, skipped);
    expect([...kept.keys()]).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(skipped[0]).toContain('d.pdf (would exceed');
  });

  test('a normal TOR still comes through untouched', () => {
    const pdf = new Uint8Array(200_000).map((_, i) => (i * 7919) % 251); // incompressible-ish
    const result = extractTorPdfs(zipSync({ 'Attach_TOR_1.pdf': pdf }));
    expect(result.oversizeSkipped).toEqual([]);
    expect(result.torFiles[0]?.bytes).toBe(pdf.length);
  });

  test('the invitation reader is held to the same limits', () => {
    const bomb = zipSync({ 'annoudoc_67019000001.pdf': new Uint8Array(8 * 1024 * 1024) });
    expect(extractInvitationPdfs(bomb, '67019000001')).toEqual({
      invitation: null,
      biddingDocument: null,
    });
  });
});

describe('download size cap', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('a declared Content-Length over the cap is refused before reading', async () => {
    let pulled = false;
    const body = new ReadableStream({
      pull() {
        pulled = true;
      },
    });
    const response = new Response(body, {
      headers: { 'content-length': String(ARCHIVE_LIMITS.maxDownloadBytes + 1) },
    });
    await expect(readBodyCapped(response, ARCHIVE_LIMITS.maxDownloadBytes, 'x')).rejects.toThrow(
      'Content-Length',
    );
    expect(pulled).toBe(false);
  });

  test('a body that lies about or omits its length is cut off at the cap', async () => {
    let sent = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1024;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    await expect(readBodyCapped(new Response(endless), 10 * 1024, 'x')).rejects.toThrow('exceeds');
    expect(sent).toBeLessThan(20 * 1024);
  });

  test('downloadArchive applies the cap to the real download path', async () => {
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(4), {
        headers: {
          'content-type': 'application/zip',
          'content-length': String(ARCHIVE_LIMITS.maxDownloadBytes + 1),
        },
      })) as unknown as typeof fetch;
    await expect(downloadArchive('zip-1')).rejects.toBeInstanceOf(ArchiveRejectedError);
  });
});
