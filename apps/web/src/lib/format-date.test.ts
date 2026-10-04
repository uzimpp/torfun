import { describe, expect, it } from 'vitest';
import { formatShortDate, formatShortDateTime, formatThaiDate } from './format-date';

describe('formatThaiDate', () => {
  it('formats an ISO timestamp as a Buddhist-era Thai date', () => {
    expect(formatThaiDate('2026-06-26T00:00:00.000Z')).toBe('26 มิถุนายน 2569');
  });

  it('uses the Bangkok day, not the UTC day', () => {
    expect(formatThaiDate('2026-06-26T18:00:00.000Z')).toBe('27 มิถุนายน 2569');
  });

  it('can include the time', () => {
    expect(formatThaiDate('2026-06-26T09:30:00.000Z', { withTime: true })).toContain('16:30');
  });

  it('returns an unparseable value unchanged', () => {
    expect(formatThaiDate('not a date')).toBe('not a date');
  });
});

describe('formatShortDate', () => {
  it('gives the Bangkok day and short month, for chart axes', () => {
    expect(formatShortDate('2026-06-26T18:00:00.000Z')).toBe('27 มิ.ย.');
  });
});

describe('formatShortDateTime', () => {
  it('adds the Bangkok clock time', () => {
    expect(formatShortDateTime('2026-06-26T09:30:00.000Z')).toBe('26 มิ.ย. 16:30');
  });
});
