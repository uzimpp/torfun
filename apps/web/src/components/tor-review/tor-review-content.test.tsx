import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EMPTY_TIMELINE, type Procurement, type ProcurementStatus } from '@torfun/types';

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
  fetchTorMatch: vi.fn(),
  fetchTorContracts: vi.fn(),
  fetchTorContractSubmissions: vi.fn(),
  fetchTorBudgetComparison: vi.fn(),
}));

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

const tor = {
  projectId: '66059313551',
  projectName: 'จ้างพัฒนาระบบสารสนเทศ',
  deptName: 'กรุงเทพมหานคร',
  projectMoney: 4_500_000,
  priceBuild: null,
  timeline: { ...EMPTY_TIMELINE, status: 'open' },
  announceDate: '2026-10-01',
  purchaseMethodName: null,
  budgetYear: 2568,
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

const withStatus = (status: ProcurementStatus) =>
  ({ ...tor, timeline: { ...EMPTY_TIMELINE, status } }) as Procurement;
const officialDeadline = {
  ...tor,
  timeline: { ...EMPTY_TIMELINE, status: 'open', deadlineAt: '2026-10-20T09:30:00.000Z' },
} as Procurement;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.fetchTorMatch.mockResolvedValue({ match: null });
  mocked.fetchTorContracts.mockResolvedValue({ items: [] });
  mocked.fetchTorContractSubmissions.mockResolvedValue({ items: [] });
  mocked.fetchTorBudgetComparison.mockResolvedValue({ minSample: 5, budget: null, groups: [] });
});

describe('TorReviewContent', () => {
  test('shows announcement date in its own section beneath budget, beside the deadline', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    render(<TorReviewContent projectId="66059313551" />);

    const announcement = await screen.findByRole('group', { name: 'วันที่ประกาศ' });
    expect(announcement).toHaveTextContent('1 ตุลาคม 2569');
    expect(announcement).toHaveClass('mt-3');
    expect(announcement).not.toHaveClass('border-t');
    expect(within(announcement).getByText('1 ตุลาคม 2569')).toHaveClass('text-base');
    expect(screen.queryByRole('heading', { name: 'กำหนดการสำคัญ' })).not.toBeInTheDocument();
    const deadline = screen.getByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toBeInTheDocument();
    expect(deadline).toHaveClass('mt-3');
    expect(deadline).not.toHaveClass('border-t');
    expect(within(deadline).getByText('—')).toHaveClass('text-base');
  });

  test('shows the summary without any confidence line', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    render(<TorReviewContent projectId="66059313551" />);

    expect(await screen.findByText('จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน')).toBeInTheDocument();
    expect(screen.queryByText(/ระดับความมั่นใจ/)).not.toBeInTheDocument();
  });

  test('shows qualification results and consistent notification evidence', async () => {
    mocked.fetchTorMatch.mockResolvedValueOnce({
      match: {
        company_id: 'company',
        project_id: tor.projectId,
        overall_score: 0,
        reasons: ['ไม่ตรงเงื่อนไข: ต้องมี ISO 9001'],
        unmatched: [],
        scoring_version: 'qualification-clauses-v1',
        input_version: 'fixture',
        computed_at: new Date(0).toISOString(),
      },
    });
    mocked.fetchTor.mockResolvedValue({
      ...tor,
      analysis: {
        ...tor.analysis!,
        qualifications: [
          {
            kind: 'company_certificate',
            standard: 'ISO 9001',
            issuer: null,
            source: 'ข้อ 4.1 หน้า 6',
            text: 'ต้องมีใบรับรอง ISO 9001',
          },
        ],
      },
      matchResult: {
        companyId: 'company',
        projectId: tor.projectId,
        overallScore: 0,
        computedAt: new Date(0),
        checks: [{ status: 'not_met', evidence: ['ใบรับรองที่ตรงเงื่อนไขหมดอายุแล้ว'] }],
      },
    });
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('คะแนนคุณสมบัติโดยประมาณ 0%')).toBeInTheDocument();
    expect(screen.getByText('อ้างอิง TOR · ข้อ 4.1 หน้า 6')).toBeInTheDocument();
    expect(screen.getByText('ไม่ตรงเงื่อนไข')).toBeInTheDocument();
    expect(screen.getByText('ใบรับรองที่ตรงเงื่อนไขหมดอายุแล้ว')).toBeInTheDocument();
    expect(await screen.findByText('คะแนนเทียบคุณสมบัติจาก TOR')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('ไม่ตรงเงื่อนไข: ต้องมี ISO 9001')).toBeInTheDocument();
  });

  test('shows how the winner is chosen, with its pointer and the verify note', async () => {
    mocked.fetchTor.mockResolvedValue({
      ...tor,
      analysis: {
        ...tor.analysis!,
        evaluation: {
          method: 'price_performance',
          quote: null,
          source: 'ข้อ 8',
          document: 'invitation',
          criteria: [{ name: 'ราคา', weight: 30, unit: 'percent' }],
          promptVersion: 'test',
        },
      },
    });
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('วิธีพิจารณาผู้ชนะและเกณฑ์น้ำหนัก')).toBeInTheDocument();
    expect(screen.getByText('เกณฑ์ราคาประกอบเกณฑ์อื่น')).toBeInTheDocument();
    expect(screen.getByText('อ้างอิง ประกาศเชิญชวน · ข้อ 8')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText(/AI อ่านวิธีพิจารณาผู้ชนะจากประกาศเชิญชวน/)).toBeInTheDocument();
  });

  test('says the evaluation was never read when the analysis has none', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('วิธีพิจารณาผู้ชนะและเกณฑ์น้ำหนัก')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่มีข้อมูลวิธีพิจารณาผู้ชนะ')).toBeInTheDocument();
  });

  test('shows the award section with the winner of exactly this project id', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    mocked.fetchTorContracts.mockResolvedValue({
      items: [
        {
          projectId: tor.projectId,
          contractYear: 2569,
          contractNo: 'CN-1',
          winnerName: 'บริษัท ตัวอย่าง จำกัด',
          winnerTin: null,
          priceAgree: 4_400_000,
          contractDate: null,
          contractFinishDate: null,
          status: null,
        },
      ],
    });
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('ผู้ชนะและราคา')).toBeInTheDocument();
    expect(await screen.findByText('บริษัท ตัวอย่าง จำกัด')).toBeInTheDocument();
    expect(mocked.fetchTorContracts).toHaveBeenCalledWith(tor.projectId);
  });

  test('shows an empty award state, not another project\u2019s winner, when nothing matches', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    mocked.fetchTorContracts.mockResolvedValue({
      items: [
        {
          projectId: '99999999999',
          contractYear: 2569,
          contractNo: null,
          winnerName: 'บริษัท อื่น จำกัด',
          winnerTin: null,
          priceAgree: 1,
          contractDate: null,
          contractFinishDate: null,
          status: null,
        },
      ],
    });
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('ยังไม่มีข้อมูลผู้ชนะและราคา')).toBeInTheDocument();
    expect(screen.queryByText('บริษัท อื่น จำกัด')).not.toBeInTheDocument();
  });

  test('a failed award load leaves the rest of the page intact', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    mocked.fetchTorContracts.mockRejectedValue(new Error('boom'));
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('โหลดข้อมูลผู้ชนะและราคาไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน')).toBeInTheDocument();
  });

  test('shows the budget comparison section for this project id', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    mocked.fetchTorBudgetComparison.mockResolvedValue({ minSample: 5, budget: null, groups: [] });
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('เทียบงบประมาณกับโครงการคล้ายกัน')).toBeInTheDocument();
    expect(await screen.findByText('เทียบงบประมาณไม่ได้')).toBeInTheDocument();
    expect(mocked.fetchTorBudgetComparison).toHaveBeenCalledWith(tor.projectId);
  });

  test('a failed budget comparison leaves the rest of the page intact', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    mocked.fetchTorBudgetComparison.mockRejectedValue(new Error('boom'));
    render(<TorReviewContent projectId={tor.projectId} />);

    expect(await screen.findByText('โหลดการเทียบงบประมาณไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('จ้างพัฒนาระบบสารสนเทศสำหรับงานทะเบียน')).toBeInTheDocument();
  });

  test('shows an official bid deadline with no note that the model read it', async () => {
    mocked.fetchTor.mockResolvedValue(officialDeadline);
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('20 ตุลาคม 2569');
    expect(deadline).toHaveTextContent('16:30');
    expect(within(deadline).queryByText(/โดย AI/)).not.toBeInTheDocument();
  });

  test('says a deadline read from the TOR by the model is to be checked against the source', async () => {
    mocked.fetchTor.mockResolvedValue({
      ...tor,
      analysis: { ...tor.analysis!, deadlineAt: '2026-10-20T09:30:00.000Z' },
    });
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('20 ตุลาคม 2569');
    expect(within(deadline).getByText(/อ่านจากเอกสาร TOR โดย AI/)).toBeInTheDocument();
    expect(within(deadline).getByText(/ตรวจสอบกับเอกสารต้นฉบับ/)).toBeInTheDocument();
  });

  test('shows the bid deadline once', async () => {
    mocked.fetchTor.mockResolvedValue(officialDeadline);
    render(<TorReviewContent projectId="66059313551" />);

    expect(await screen.findAllByText(/20 ตุลาคม 2569/)).toHaveLength(1);
  });

  test('shows the budget year and the project status in its shared badge', async () => {
    mocked.fetchTor.mockResolvedValue(withStatus('unknown'));
    const { container } = render(<TorReviewContent projectId="66059313551" />);

    expect(await screen.findByText('ปีงบประมาณ 2568')).toBeInTheDocument();
    expect(container.querySelector('[data-status="unknown"]')).toHaveTextContent('ยังไม่ทราบสถานะ');
  });

  test('says there is no bid window yet for a project still being drafted', async () => {
    mocked.fetchTor.mockResolvedValue(withStatus('drafting'));
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('ยังไม่มีกำหนดยื่นข้อเสนอ');
    expect(within(deadline).queryByText(/โดย AI/)).not.toBeInTheDocument();
  });

  test('shows a dash when the deadline is unknown on a project that is not being drafted', async () => {
    mocked.fetchTor.mockResolvedValue(tor);
    render(<TorReviewContent projectId="66059313551" />);

    const deadline = await screen.findByRole('group', { name: 'กำหนดยื่นข้อเสนอ' });
    expect(deadline).toHaveTextContent('—');
  });
});
