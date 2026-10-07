import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { procurementDay, thailandDay, type Procurement } from '@torfun/types';
import { ProcurementTiming } from './procurement-timing';

// This component reads only these fields; fixtures never touch the ingested database.
const row = (
  status: Procurement['status'],
  deadlineAt: string | null,
  winner: Procurement['winner'] = null,
) =>
  ({
    projectId: 'test-tor',
    status,
    analysis: { deadlineAt },
    winner,
    announceDate: '2026-10-01',
  }) as Procurement;

describe('procurement timing', () => {
  test('shows drafting without suggesting bids can already be submitted', () => {
    render(<ProcurementTiming item={row('drafting_tor', '2026-10-07')} today="2026-10-05" />);
    expect(screen.getByText('จัดทำ TOR')).toBeInTheDocument();
    expect(screen.getByText('เตรียมตัวก่อนเปิดรับข้อเสนอ')).toBeInTheDocument();
    expect(screen.queryByText('เหลืออีก 2 วัน')).not.toBeInTheDocument();
  });

  test('shows days remaining and keeps the AI date linked to the source review', () => {
    render(<ProcurementTiming item={row('invitation', '2026-10-07')} today="2026-10-05" />);
    expect(screen.getByText('เหลืออีก 2 วัน')).toBeInTheDocument();
    expect(screen.getByText(/วันที่สกัดโดย AI/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ตรวจสอบ TOR ต้นฉบับ' })).toHaveAttribute(
      'href',
      '/tor/test-tor',
    );
  });

  test('distinguishes today, expired, and missing deadlines', () => {
    render(<ProcurementTiming item={row('invitation', '2026-10-05')} today="2026-10-05" />);
    expect(screen.getByText('ครบกำหนดวันนี้')).toBeInTheDocument();
    cleanup();
    render(<ProcurementTiming item={row('invitation', '2026-10-04')} today="2026-10-05" />);
    expect(screen.getByText('พ้นกำหนดตาม TOR แล้ว 1 วัน')).toBeInTheDocument();
    cleanup();
    render(<ProcurementTiming item={row('invitation', null)} today="2026-10-05" />);
    expect(screen.getByText('ยังไม่ทราบวันปิดรับข้อเสนอ')).toBeInTheDocument();
  });

  test('never shows an awarded, contracted, or cancelled project as an upcoming bid', () => {
    for (const stage of ['award_announced', 'contracted', 'cancelled'] as const) {
      render(<ProcurementTiming item={row(stage, '2026-10-07')} today="2026-10-05" />);
      expect(screen.queryByText('เหลืออีก 2 วัน')).not.toBeInTheDocument();
      cleanup();
    }
    render(
      <ProcurementTiming
        item={row('invitation', '2026-10-07', { name: 'ผู้ชนะ' } as Procurement['winner'])}
        today="2026-10-05"
      />,
    );
    expect(screen.getByText('มีผู้ชนะแล้ว')).toBeInTheDocument();
    expect(screen.queryByText('เหลืออีก 2 วัน')).not.toBeInTheDocument();
  });

  test('uses Thailand calendar dates across UTC midnight and rejects unreadable dates', () => {
    expect(thailandDay(new Date('2026-10-04T18:00:00Z'))).toBe('2026-10-05');
    expect(procurementDay('2026-10-07T18:00:00Z')).toBe('2026-10-08');
    expect(procurementDay('2026-10-07')).toBe('2026-10-07');
    expect(procurementDay('unknown')).toBeNull();
  });
});
