import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { procurementDay, thailandDay, type Procurement } from '@torfun/types';
import { DaysLeftBadge, ProcurementTiming } from './procurement-timing';

// This component reads only these fields; fixtures never touch the ingested database.
const row = (status: Procurement['status'], deadlineAt: string | null) =>
  ({
    projectId: 'test-tor',
    status,
    deadlineAt,
    deadlineSource: deadlineAt ? 'tor' : null,
    announceDate: '2026-10-01',
  }) as Procurement;

describe('procurement timing', () => {
  const badge = (status: Procurement['status'], deadlineAt: string | null) =>
    render(<DaysLeftBadge item={row(status, deadlineAt)} today="2026-10-05" />);

  test('shows drafting without suggesting bids can already be submitted', () => {
    badge('drafting', '2026-10-07');
    expect(screen.getByText('เตรียมตัวก่อนเปิดรับข้อเสนอ')).toBeInTheDocument();
    expect(screen.queryByText('เหลืออีก 2 วัน')).not.toBeInTheDocument();
  });

  test('shows days left, and keeps the AI date linked to the source review', () => {
    badge('open', '2026-10-07');
    expect(screen.getByText('เหลืออีก 2 วัน')).toBeInTheDocument();
    cleanup();
    render(<ProcurementTiming item={row('open', '2026-10-07')} />);
    expect(screen.getByText(/วันที่สกัดโดย AI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ตรวจสอบ TOR ต้นฉบับ' })).toHaveAttribute(
      'href',
      '/tor/test-tor',
    );
  });

  test('distinguishes today, expired, and missing deadlines', () => {
    badge('open', '2026-10-05');
    expect(screen.getByText('ครบกำหนดวันนี้')).toBeInTheDocument();
    cleanup();
    badge('open', '2026-10-04');
    expect(screen.getByText('พ้นกำหนดตาม TOR แล้ว 1 วัน')).toBeInTheDocument();
    cleanup();
    const { container } = badge('open', null);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    render(<ProcurementTiming item={row('open', null)} />);
    expect(screen.getByText('ยังไม่ทราบวันปิดรับข้อเสนอ')).toBeInTheDocument();
  });

  test('never shows an awarded, contracted, or cancelled project as an upcoming bid', () => {
    for (const stage of ['awarded', 'contracted', 'cancelled'] as const) {
      const { container } = badge(stage, '2026-10-07');
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  test('uses Thailand calendar dates across UTC midnight and rejects unreadable dates', () => {
    expect(thailandDay(new Date('2026-10-04T18:00:00Z'))).toBe('2026-10-05');
    expect(procurementDay('2026-10-07T18:00:00Z')).toBe('2026-10-08');
    expect(procurementDay('2026-10-07')).toBe('2026-10-07');
    expect(procurementDay('unknown')).toBeNull();
  });
});
