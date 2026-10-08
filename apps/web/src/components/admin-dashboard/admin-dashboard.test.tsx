import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EMPTY_MILESTONES, OUTCOME_LABELS, type Procurement } from '@torfun/types';

import type { IngestionSummaryResponse } from '@/lib/api';
import { AdminDashboard } from './admin-dashboard';
import { OutcomeDonut } from './outcome-donut';
import { RecentActivity } from './recent-activity';
import { outcomeBuckets } from '@/lib/outcome-buckets';
import type { AdminDashboardData } from './use-admin-dashboard-data';

vi.mock('./use-admin-dashboard-data', () => ({ useAdminDashboardData: vi.fn() }));
const { useAdminDashboardData } = await import('./use-admin-dashboard-data');
const mockedHook = vi.mocked(useAdminDashboardData);

function summary(overrides: Partial<IngestionSummaryResponse> = {}): IngestionSummaryResponse {
  return {
    total: 288,
    byState: { Queued: 243, Processing: 1, Completed: 44 },
    byOutcome: {
      queued: 243,
      tor_analysed: 38,
      analysis_failed: 2,
      downloading: 1,
    },
    byAgency: [],
    byYear: [],
    torDocumentsRetrieved: 38,
    totalTorBytes: 0,
    failureCount: 4,
    lastRunAt: '2026-09-30T10:00:00.000Z',
    openDataQuota: null,
    runInProgress: false,
    runStartedAt: null,
    stopRequested: false,
    agencies: [],
    ...overrides,
  };
}

function record(overrides: Partial<Procurement> = {}): Procurement {
  return {
    projectId: '67109288963',
    projectName: 'ประกวดราคาจ้างพัฒนาระบบสารสนเทศ',
    deptName: 'กรุงเทพมหานคร',
    deptSubName: null,
    province: null,
    district: null,
    subdistrict: null,
    deptCode: '3100001',
    budgetYear: 2568,
    announceDate: null,
    projectTypeName: null,
    purchaseMethodName: null,
    projectMoney: null,
    priceBuild: null,
    status: 'unknown',
    milestones: EMPTY_MILESTONES,
    timelineCheckedAt: null,
    deadlineAt: null,
    deadlineSource: null,
    state: 'Completed',
    outcome: 'tor_analysed',
    attempts: 0,
    holdReason: null,
    approvedBy: null,
    approvedAt: null,
    statusHistory: [],
    zipId: null,
    documents: [],
    analysis: null,
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-30T11:55:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-09-30T12:00:00.000Z');

describe('OutcomeDonut', () => {
  test('describes the whole chart in words for a screen reader', () => {
    render(<OutcomeDonut buckets={outcomeBuckets(summary().byOutcome)} total={288} />);

    const chart = screen.getByRole('img');
    const description = chart.getAttribute('aria-label') ?? '';
    expect(description).toContain('288');
    expect(description).toContain('วิเคราะห์แล้ว 38');
    expect(description).toContain('รอ 243');
  });

  test('the legend carries every bucket with its count and percent, so colour is never the only cue', () => {
    render(<OutcomeDonut buckets={outcomeBuckets(summary().byOutcome)} total={288} />);

    const legend = screen.getByRole('list', { name: 'สัดส่วนตามผลการประมวลผล' });
    const rows = within(legend).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('วิเคราะห์แล้ว');
    expect(rows[0]).toHaveTextContent('38');
    expect(rows[0]).toHaveTextContent('13%');
    expect(rows[4]).toHaveTextContent('รอ');
    expect(rows[4]).toHaveTextContent('243');
  });

  test('offers every outcome as a table, using the shared Thai labels', () => {
    render(
      <OutcomeDonut
        buckets={outcomeBuckets(summary().byOutcome)}
        total={288}
        byOutcome={summary().byOutcome}
      />,
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText(OUTCOME_LABELS.tor_analysed)).toBeInTheDocument();
    expect(within(table).getByText(OUTCOME_LABELS.abandoned)).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(11); // header + ten outcomes
  });

  test('says so, rather than drawing an empty ring, when nothing has been ingested', () => {
    render(<OutcomeDonut buckets={outcomeBuckets({})} total={0} />);

    expect(screen.getByText('ยังไม่มีประกาศในระบบ')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('RecentActivity', () => {
  test('lists each procurement with its agency, outcome and how long ago it changed', () => {
    render(
      <RecentActivity
        items={[
          record(),
          record({
            projectId: '2',
            projectName: 'จ้างพัฒนาแอปพลิเคชัน',
            outcome: 'analysis_failed',
            updatedAt: '2026-09-30T09:00:00.000Z',
          }),
        ]}
        now={NOW}
      />,
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('ประกวดราคาจ้างพัฒนาระบบสารสนเทศ');
    expect(rows[0]).toHaveTextContent('กรุงเทพมหานคร');
    expect(rows[0]).toHaveTextContent(OUTCOME_LABELS.tor_analysed);
    expect(rows[0]).toHaveTextContent('5 นาทีที่แล้ว');
    expect(rows[1]).toHaveTextContent(OUTCOME_LABELS.analysis_failed);
    expect(rows[1]).toHaveTextContent('3 ชั่วโมงที่แล้ว');
  });

  test('an analysed TOR links to its detail page; anything else to the ingestion console', () => {
    render(
      <RecentActivity
        items={[record(), record({ projectId: '2', outcome: 'queued', state: 'Queued' })]}
        now={NOW}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/tor/67109288963');
    expect(links[1]).toHaveAttribute('href', '/admin/ingestion');
  });

  test('has an empty state', () => {
    render(<RecentActivity items={[]} now={NOW} />);
    expect(screen.getByText('ยังไม่มีความเคลื่อนไหว')).toBeInTheDocument();
  });
});

describe('AdminDashboard', () => {
  const data = (overrides: Partial<AdminDashboardData> = {}): AdminDashboardData => ({
    summary: summary(),
    recent: [record()],
    asOf: NOW,
    loading: false,
    error: null,
    sessionEnded: false,
    retry: vi.fn(),
    ...overrides,
  });

  beforeEach(() => vi.clearAllMocks());

  test('shows a skeleton the size of the content while loading, and says it is busy', () => {
    mockedHook.mockReturnValue(data({ summary: null, recent: [], loading: true }));
    render(<AdminDashboard />);

    expect(screen.getByLabelText('กำลังโหลดข้อมูลแดชบอร์ด')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('ประกาศทั้งหมด')).not.toBeInTheDocument();
  });

  test('shows the six KPI tiles, the chart and the recent list once loaded', () => {
    mockedHook.mockReturnValue(data());
    render(<AdminDashboard />);

    for (const label of [
      'ประกาศทั้งหมด',
      'รอ',
      'กำลังทำ',
      'วิเคราะห์แล้ว',
      'ล้มเหลว',
      'รอบล่าสุด',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByText('ประกวดราคาจ้างพัฒนาระบบสารสนเทศ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ติดตามการดึงข้อมูล/ })).toHaveAttribute(
      'href',
      '/admin/ingestion',
    );
  });

  test('an ended session says so and links back to sign-in, with no retry button', () => {
    mockedHook.mockReturnValue(
      data({ summary: null, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', sessionEnded: true }),
    );
    render(<AdminDashboard />);

    expect(screen.getByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).not.toBeInTheDocument();
  });

  test('another failure offers a retry', () => {
    const retry = vi.fn();
    mockedHook.mockReturnValue(data({ summary: null, error: 'boom', retry }));
    render(<AdminDashboard />);

    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    screen.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
