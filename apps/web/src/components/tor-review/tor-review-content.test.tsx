import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Procurement } from '@torfun/types';

import { TorReviewContent } from './tor-review-content';

/**
 * The review page shows the model's summary and nothing about how sure it was:
 * how sure the model is decides whether an officer sees a record at all, not how
 * it reads once they do.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  fetchTor: vi.fn(),
}));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const tor = {
  projectId: '66059313551',
  projectName: 'จ้างพัฒนาระบบสารสนเทศ',
  deptName: 'กรุงเทพมหานคร',
  projectMoney: 4_500_000,
  priceBuild: null,
  status: 'open',
  announceDate: null,
  purchaseMethodName: null,
  budgetYear: 2568,
  deadlineAt: null,
  deadlineSource: null,
  analysis: {
    summary: 'จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน',
    scopeOfWork: [],
    budgetThb: null,
    deadlineAt: null,
    durationDays: null,
    techStack: [],
    targetPlatforms: [],
    requiredQualifications: [],
    reason: 'พัฒนาระบบ',
  },
} as unknown as Procurement;

beforeEach(() => vi.clearAllMocks());

describe('TorReviewContent', () => {
  test('shows the summary without any confidence line', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    render(<TorReviewContent projectId="66059313551" />);

    expect(await screen.findByText('จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน')).toBeInTheDocument();
    expect(screen.queryByText(/ระดับความมั่นใจ/)).not.toBeInTheDocument();
  });

  test('shows the bid deadline with where it came from, and a reminder to verify it', async () => {
    mocked.fetchTor.mockResolvedValue({
      ...tor,
      deadlineAt: '2026-10-20T09:30:00.000Z',
      deadlineSource: 'invitation',
    });
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('20 ตุลาคม 2569');
    expect(deadline).toHaveTextContent('16:30');
    expect(within(deadline).getByText(/ที่มา: ประกาศเชิญชวน/)).toBeInTheDocument();
    expect(within(deadline).getByText(/ตรวจสอบกับเอกสารต้นฉบับ/)).toBeInTheDocument();
  });

  test('shows the bid deadline once, so it never appears without its source', async () => {
    mocked.fetchTor.mockResolvedValue({
      ...tor,
      deadlineAt: '2026-10-20T09:30:00.000Z',
      deadlineSource: 'invitation',
    });
    render(<TorReviewContent projectId="66059313551" />);

    expect(await screen.findAllByText(/20 ตุลาคม 2569/)).toHaveLength(1);
  });

  test('shows the budget year and the project status in its shared badge', async () => {
    mocked.fetchTor.mockResolvedValue({ ...tor, status: 'unknown' });
    const { container } = render(<TorReviewContent projectId="66059313551" />);

    expect(await screen.findByText('ปีงบประมาณ 2568')).toBeInTheDocument();
    expect(container.querySelector('[data-status="unknown"]')).toHaveTextContent('ยังไม่ทราบสถานะ');
  });

  test('says there is no bid window yet for a project still being drafted, with no source', async () => {
    mocked.fetchTor.mockResolvedValue({ ...tor, status: 'drafting' });
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('ยังไม่มีกำหนดยื่นข้อเสนอ');
    expect(within(deadline).queryByText(/ที่มา/)).not.toBeInTheDocument();
  });

  test('shows a dash when the deadline is unknown on a project that is not being drafted', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('—');
  });
});
