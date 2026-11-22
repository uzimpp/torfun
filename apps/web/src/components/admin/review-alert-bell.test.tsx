import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { REVIEW_QUEUE_HREF, ReviewAlertBell } from './review-alert-bell';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchReviewAlerts: vi.fn(),
}));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

beforeEach(() => vi.clearAllMocks());

describe('ReviewAlertBell', () => {
  test('shows how many held records wait and links to the held queue', async () => {
    mocked.fetchReviewAlerts.mockResolvedValue({
      waiting: 3,
      latest: [
        {
          projectId: '1',
          projectName: 'ระบบสารสนเทศ',
          deptName: 'กรมตัวอย่าง',
          holdReason: 'partial_read',
        },
      ],
    });
    render(<ReviewAlertBell />);
    const link = await screen.findByRole('link', { name: 'ประกาศรอผู้ดูแลตรวจสอบ 3 รายการ' });
    expect(link).toHaveAttribute('href', REVIEW_QUEUE_HREF);
    expect(link).toHaveAttribute('title', 'ล่าสุด: ระบบสารสนเทศ · กรมตัวอย่าง');
    expect(link).toHaveTextContent('3');
  });

  test('says nothing waits when the queue is empty', async () => {
    mocked.fetchReviewAlerts.mockResolvedValue({ waiting: 0, latest: [] });
    render(<ReviewAlertBell />);
    expect(
      await screen.findByRole('link', { name: 'ไม่มีประกาศรอผู้ดูแลตรวจสอบ' }),
    ).toBeInTheDocument();
    expect(mocked.fetchReviewAlerts).toHaveBeenCalledTimes(1);
  });
});
