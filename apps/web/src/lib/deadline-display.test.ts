import { describe, expect, it } from 'vitest';
import { deadlineText } from './deadline-display';

describe('deadlineText', () => {
  it('shows a date-only deadline as its Thai day, with no clock time', () => {
    expect(deadlineText('2026-10-20T00:00:00.000Z', 'open')).toBe('20 ตุลาคม 2569');
  });

  it('shows the time when the document stated one', () => {
    const text = deadlineText('2026-10-20T09:30:00.000Z', 'open');

    expect(text).toContain('20 ตุลาคม 2569');
    expect(text).toContain('16:30');
  });

  it('is a dash when no deadline is known', () => {
    expect(deadlineText(null, 'open')).toBe('—');
    expect(deadlineText(null, 'unknown')).toBe('—');
  });

  it('says no bid window exists yet for a project still being drafted', () => {
    expect(deadlineText(null, 'drafting')).toBe('ยังไม่มีกำหนดยื่นข้อเสนอ');
  });

  it('prefers a known deadline over the drafting text', () => {
    expect(deadlineText('2026-10-20T00:00:00.000Z', 'drafting')).toBe('20 ตุลาคม 2569');
  });
});
