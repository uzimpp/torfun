import { afterEach, describe, expect, test, vi } from 'vitest';
import { isPdf, saveBlob, torFilename, triggerDownload } from './tor-file';

const bytesOf = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('isPdf', () => {
  test('accepts a PDF by its signature', () => {
    expect(isPdf(bytesOf('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toBe(true);
  });

  test('accepts a header preceded by junk inside the first KiB, as PDF readers do', () => {
    expect(isPdf(bytesOf(`${'\n'.repeat(200)}%PDF-1.4`))).toBe(true);
  });

  test.each([
    ['an HTML page', '<!doctype html><script>alert(1)</script>'],
    ['an SVG', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
    ['JSON', '{"message":"nope"}'],
    ['an empty body', ''],
    ['a signature past the first KiB', `${'x'.repeat(1100)}%PDF-1.4`],
  ])('rejects %s', (_label, body) => {
    expect(isPdf(bytesOf(body))).toBe(false);
  });
});

describe('torFilename', () => {
  test('keeps an ordinary project id', () => {
    expect(torFilename('project-123')).toBe('tor-project-123.pdf');
  });

  test('drops path separators, quotes and markup from an untrusted id', () => {
    const name = torFilename('../../etc/passwd"><img src=x>');
    expect(name).toMatch(/^tor-[A-Za-z0-9._-]+\.pdf$/);
    expect(name).not.toMatch(/[/\\"<>]/);
  });
});

describe('downloading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('triggerDownload clicks one anchor carrying the url and a download name', () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.getAttribute('href')).toBe('blob:tor');
        expect(this.download).toBe('tor-1.pdf');
      });

    triggerDownload('blob:tor', 'tor-1.pdf');

    expect(click).toHaveBeenCalledOnce();
  });

  test('saveBlob releases its object url even if the click throws', () => {
    const createObjectURL = vi.fn(() => 'blob:tor');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

    expect(() => saveBlob(blob, 'tor-1.pdf')).toThrow('blocked');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:tor');
  });
});
