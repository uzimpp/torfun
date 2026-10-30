import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { ProcurementDeadline } from './procurement-deadline';

describe('ProcurementDeadline', () => {
  test('shows the bid deadline, and leaves where it came from to the review page', () => {
    render(
      <ProcurementDeadline
        deadline={{ at: '2026-10-20T00:00:00.000Z', kind: 'bids', readByModel: false }}
        status="open"
      />,
    );

    expect(screen.getByText('กำหนดยื่นข้อเสนอ')).toBeInTheDocument();
    expect(screen.getByText('20 ตุลาคม 2569')).toBeInTheDocument();
    expect(screen.queryByText(/ที่มา/)).not.toBeInTheDocument();
  });

  test('names a draft’s comment deadline as what it is', () => {
    render(
      <ProcurementDeadline
        deadline={{ at: '2026-10-26T17:00:00.000Z', kind: 'comments', readByModel: false }}
        status="drafting"
      />,
    );

    expect(screen.getByText('ปิดรับฟังความคิดเห็น')).toBeInTheDocument();
    expect(screen.queryByText('กำหนดยื่นข้อเสนอ')).not.toBeInTheDocument();
  });

  test('says there is no bid window yet while the project is being drafted', () => {
    render(<ProcurementDeadline deadline={null} status="drafting" />);

    expect(screen.getByText('ยังไม่มีกำหนดยื่นข้อเสนอ')).toBeInTheDocument();
  });

  test('is a dash when the deadline is not known', () => {
    render(<ProcurementDeadline deadline={null} status="unknown" />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
