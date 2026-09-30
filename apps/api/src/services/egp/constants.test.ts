import { describe, expect, test } from 'bun:test';
import { SOFTWARE_KEYWORDS } from './constants';

const keywords: readonly string[] = SOFTWARE_KEYWORDS;

describe('SOFTWARE_KEYWORDS', () => {
  test('has no duplicates, since each entry costs upstream calls', () => {
    expect(new Set(keywords).size).toBe(keywords.length);
  });

  test('covers the terms an administrator asked discovery to pull', () => {
    for (const keyword of [
      'ซอฟต์แวร์',
      'ระบบสารสนเทศ',
      'พัฒนาระบบ',
      'โปรแกรมคอมพิวเตอร์',
      'แอปพลิเคชัน',
      'เว็บไซต์',
      'software',
      'application',
      'website',
    ]) {
      expect(keywords).toContain(keyword);
    }
  });

  test('lists capitalised English forms, because the upstream match is case-sensitive', () => {
    for (const keyword of ['Software', 'Application', 'Website']) {
      expect(keywords).toContain(keyword);
    }
  });
});
