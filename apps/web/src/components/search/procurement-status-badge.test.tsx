import { render, screen } from '@testing-library/react';
import { ProcurementStatus, STATUS_LABELS } from '@torfun/types';
import { describe, expect, test } from 'vitest';

import { ProcurementStatusBadge } from './procurement-status-badge';

describe('ProcurementStatusBadge', () => {
  test('says the stage in Thai for every stage, and never shows the enum name', () => {
    for (const status of ProcurementStatus.options) {
      const { unmount } = render(<ProcurementStatusBadge status={status} source={null} />);
      const badge = screen.getByText(STATUS_LABELS[status]);
      expect(badge).toBeInTheDocument();
      expect(badge.closest('[data-status]')).toHaveAttribute('data-status', status);
      expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
      unmount();
    }
  });

  test('sets the drafting stage apart by more than colour: an icon and a stated reason', () => {
    render(<ProcurementStatusBadge status="drafting" source="ai" />);

    const badge = screen.getByText('ร่าง / เตรียมการ').closest('[data-status]');
    expect(badge).toHaveAttribute('data-emphasis', 'prepare-ahead');
    expect(badge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveAttribute('title', expect.stringContaining('เตรียมตัวล่วงหน้า'));
  });

  test('gives no other stage that emphasis', () => {
    for (const status of ProcurementStatus.options.filter((item) => item !== 'drafting')) {
      const { unmount } = render(<ProcurementStatusBadge status={status} source={null} />);
      expect(screen.getByText(STATUS_LABELS[status]).closest('[data-status]')).not.toHaveAttribute(
        'data-emphasis',
      );
      unmount();
    }
  });

  test('marks a stage Gemini read from the documents, and not one the feed named', () => {
    const { rerender } = render(<ProcurementStatusBadge status="awarded" source="ai" />);
    expect(screen.getByText('AI ประเมิน')).toBeInTheDocument();
    expect(screen.getByText('ประกาศผู้ชนะแล้ว').closest('[data-status]')).toHaveAttribute(
      'title',
      expect.stringContaining('ตรวจสอบกับเอกสารต้นฉบับ'),
    );

    rerender(<ProcurementStatusBadge status="awarded" source="upstream" />);
    expect(screen.queryByText('AI ประเมิน')).not.toBeInTheDocument();
  });

  test('shows an unclassified procurement quietly, as not yet specified', () => {
    render(<ProcurementStatusBadge status="unknown" source={null} />);

    expect(screen.getByText('ยังไม่ระบุ')).toBeInTheDocument();
    expect(screen.queryByText('AI ประเมิน')).not.toBeInTheDocument();
  });
});
