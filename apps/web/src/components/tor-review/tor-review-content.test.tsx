import { render, screen } from '@testing-library/react';
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
  province: null,
  district: null,
  subdistrict: null,
  projectMoney: 4_500_000,
  priceBuild: null,
  status: 'open',
  announceDate: null,
  purchaseMethodName: null,
  year: 2568,
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
});
