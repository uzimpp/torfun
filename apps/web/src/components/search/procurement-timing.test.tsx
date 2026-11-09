import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import {
  EMPTY_TIMELINE,
  procurementDay,
  thailandDay,
  type Procurement,
  type ProcurementStatus,
} from '@torfun/types';
import { ProcurementTiming } from './procurement-timing';

// This component reads only these fields; fixtures never touch the ingested database.
const row = (status: ProcurementStatus, deadlineAt: string | null) =>
  ({
    projectId: 'test-tor',
    timeline: { ...EMPTY_TIMELINE, status },
    analysis: { deadlineAt },
    announceDate: '2026-10-01',
  }) as Procurement;

describe('procurement timing', () => {
  test('keeps the AI-extracted deadline linked to the source review', () => {
    render(<ProcurementTiming item={row('open', '2026-10-07')} />);
    expect(screen.getByText(/วันที่สกัดโดย AI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ตรวจสอบ TOR ต้นฉบับ' })).toHaveAttribute(
      'href',
      '/tor/test-tor',
    );
  });

  test('an official deadline carries no AI note', () => {
    const official = {
      ...row('open', null),
      timeline: { ...EMPTY_TIMELINE, status: 'open', deadlineAt: '2026-10-07' },
    } as Procurement;

    render(<ProcurementTiming item={official} />);

    expect(screen.getByText(/7 ต\.ค\. 2569/)).toBeInTheDocument();
    expect(screen.queryByText(/วันที่สกัดโดย AI/)).not.toBeInTheDocument();
  });

  test('details mode omits the redundant drafting reminder', () => {
    render(
      <ProcurementTiming
        item={row('drafting', '2026-10-07')}
        mode="details"
      />,
    );

    expect(screen.queryByText('เตรียมตัวก่อนเปิดรับข้อเสนอ')).not.toBeInTheDocument();
    expect(screen.queryByText(/พ้นกำหนดตาม TOR/)).not.toBeInTheDocument();
  });

  test('shows an unknown deadline when no date is available', () => {
    render(<ProcurementTiming item={row('open', null)} />);
    expect(screen.getByText('ยังไม่ทราบวันปิดรับข้อเสนอ')).toBeInTheDocument();
  });

  test('uses Thailand calendar dates across UTC midnight and rejects unreadable dates', () => {
    expect(thailandDay(new Date('2026-10-04T18:00:00Z'))).toBe('2026-10-05');
    expect(procurementDay('2026-10-07T18:00:00Z')).toBe('2026-10-08');
    expect(procurementDay('2026-10-07')).toBe('2026-10-07');
    expect(procurementDay('unknown')).toBeNull();
  });
});
