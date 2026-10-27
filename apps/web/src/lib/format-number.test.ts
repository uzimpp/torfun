import { describe, expect, it } from 'vitest';
import { formatCompact, formatCount } from './format-number';

describe('formatCount', () => {
  it('groups thousands with Western digits', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(0)).toBe('0');
  });
});

describe('formatCompact', () => {
  it('shortens a large count to one decimal', () => {
    expect(formatCompact(1_250_000)).toMatch(/^1\.3\s?M$/);
    expect(formatCompact(950)).toBe('950');
  });
});
