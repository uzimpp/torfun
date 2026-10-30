import { describe, expect, it } from 'vitest';
import { deadlineLabel, deadlineText } from './deadline-display';

const bids = (at: string) => ({ at, kind: 'bids' as const, readByModel: false });

describe('deadlineText', () => {
  it('shows a date-only deadline as its Thai day, with no clock time', () => {
    expect(deadlineText(bids('2026-10-20T00:00:00.000Z'), 'open')).toBe('20 ตุลาคม 2569');
  });

  it('shows the time when the document stated one', () => {
    const text = deadlineText(bids('2026-10-20T09:30:00.000Z'), 'open');

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
    expect(deadlineText(bids('2026-10-20T00:00:00.000Z'), 'drafting')).toBe('20 ตุลาคม 2569');
  });
});

describe('deadlineLabel', () => {
  it('names a draft’s comment deadline apart from a bid deadline', () => {
    expect(
      deadlineLabel({ at: '2026-10-26T17:00:00.000Z', kind: 'comments', readByModel: false }),
    ).toBe('ปิดรับฟังความคิดเห็น');
    expect(deadlineLabel(bids('2026-10-20T00:00:00.000Z'))).toBe('กำหนดยื่นข้อเสนอ');
    expect(deadlineLabel(null)).toBe('กำหนดยื่นข้อเสนอ');
  });
});
