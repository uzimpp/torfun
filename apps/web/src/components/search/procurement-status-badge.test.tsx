import { render, screen } from '@testing-library/react';
import { ProcurementStatus, STATUS_LABELS } from '@torfun/types';
import { describe, expect, test } from 'vitest';

import { ProcurementStatusBadge } from './procurement-status-badge';

describe('ProcurementStatusBadge', () => {
  test('says the stage in Thai for every stage, and never shows the enum name', () => {
    for (const status of ProcurementStatus.options) {
      const { unmount } = render(<ProcurementStatusBadge status={status} />);
      const badge = screen.getByText(STATUS_LABELS[status]);
      expect(badge).toBeInTheDocument();
      expect(badge.closest('[data-status]')).toHaveAttribute('data-status', status);
      expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
      unmount();
    }
  });

  test('sets the drafting stage apart by more than colour: an icon and a stated reason', () => {
    render(<ProcurementStatusBadge status="drafting" />);

    const badge = screen.getByText('ร่าง / เตรียมการ').closest('[data-status]');
    expect(badge).toHaveAttribute('data-emphasis', 'prepare-ahead');
    expect(badge?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveAttribute('title', expect.stringContaining('เตรียมตัวล่วงหน้า'));
  });

  test('gives no other stage that emphasis', () => {
    for (const status of ProcurementStatus.options.filter((item) => item !== 'drafting')) {
      const { unmount } = render(<ProcurementStatusBadge status={status} />);
      expect(screen.getByText(STATUS_LABELS[status]).closest('[data-status]')).not.toHaveAttribute(
        'data-emphasis',
      );
      unmount();
    }
  });

  test('shows an unread timeline quietly and neutrally, as not yet known', () => {
    render(<ProcurementStatusBadge status="unknown" />);

    const badge = screen.getByText('ยังไม่ทราบสถานะ').closest('[data-status]');
    expect(badge).toHaveAttribute('data-status', 'unknown');
    expect(badge).not.toHaveAttribute('title');
  });
});
