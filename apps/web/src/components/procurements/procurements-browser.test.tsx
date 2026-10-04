import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EMPTY_MILESTONES, HOLD_REASON_LABELS, type Procurement } from '@torfun/types';

import { ApiError } from '@/lib/api';
import { EMPTY_PROCUREMENT_URL, type ProcurementUrlState } from './procurement-filter-values';
import { ProcurementsBrowser } from './procurements-browser';

/**
 * The admin procurement list as an administrator drives it: every filter, page
 * and open record lives in the URL, so what is asserted is the address the page
 * asks the router for. The API does not exist as far as these tests are concerned.
 */
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')),
  fetchProjects: vi.fn(),
  fetchTor: vi.fn(),
  fetchSummary: vi.fn(),
  fetchFailures: vi.fn(),
  downloadTor: vi.fn(),
}));
vi.mock('@/lib/api-procurement-actions', () => ({
  approveProcurement: vi.fn(),
  markNonSoftware: vi.fn(),
  deleteProcurement: vi.fn(),
}));
vi.mock('@/lib/api-tombstones', () => ({
  fetchTombstones: vi.fn(),
  removeTombstone: vi.fn(),
  restoreTombstone: vi.fn(),
}));

const api = vi.mocked(await import('@/lib/api'));
const actions = vi.mocked(await import('@/lib/api-procurement-actions'));
const tombstones = vi.mocked(await import('@/lib/api-tombstones'));

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
    projectMoney: 1_500_000,
    priceBuild: null,
    status: 'open',
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
    zipId: 'Z1',
    documents: [
      {
        member: 'tor.pdf',
        filename: 'tor.pdf',
        bytes: 1_048_576,
        role: 'main_tor',
        namePattern: 'canonical',
        note: '',
      } as Procurement['documents'][number],
    ],
    analysis: {
      summary: 'พัฒนาระบบบริหารงานบุคคล',
      scopeOfWork: [],
      budgetThb: null,
      deadlineAt: null,
      durationDays: null,
      techStack: [],
      targetPlatforms: [],
      requiredQualifications: [],
    },
    winner: null,
    torAmbiguous: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    sourceHash: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const other = record({ projectId: '66019999999', projectName: 'จ้างพัฒนาแอปพลิเคชันมือถือ' });

const summary = {
  total: 2,
  byState: {},
  byOutcome: {},
  byAgency: [],
  byYear: [{ budgetYear: 2568, count: 2 }],
  torDocumentsRetrieved: 0,
  totalTorBytes: 0,
  failureCount: 0,
  lastRunAt: null,
  openDataQuota: null,
  runInProgress: false,
  runStartedAt: null,
  stopRequested: false,
  agencies: ['กรุงเทพมหานคร', 'กรมบัญชีกลาง'],
};

function renderBrowser(url: Partial<ProcurementUrlState> = {}) {
  return render(<ProcurementsBrowser initialUrl={{ ...EMPTY_PROCUREMENT_URL, ...url }} />);
}

const lastHref = () => replace.mock.lastCall?.[0];

beforeEach(() => {
  vi.resetAllMocks();
  api.fetchProjects.mockResolvedValue({
    items: [record(), other],
    total: 125,
    limit: 25,
    offset: 0,
  });
  api.fetchSummary.mockResolvedValue(summary);
  api.fetchFailures.mockResolvedValue({ items: [] });
});

describe('the list', () => {
  test('shows each record, the total and where the page sits in it', async () => {
    renderBrowser();

    expect(
      await screen.findByRole('button', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /จ้างพัฒนาแอปพลิเคชันมือถือ/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('125');
    expect(screen.getByText('1–25 จาก 125')).toBeInTheDocument();
  });

  test('asks the API for the page and filters the URL names', async () => {
    renderBrowser({ outcome: 'needs_review', page: 2 });

    await screen.findByText('26–50 จาก 125');
    expect(api.fetchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'needs_review', offset: 25 }),
    );
  });

  test('says when nothing matches, and offers to clear the filters', async () => {
    api.fetchProjects.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
    renderBrowser({ outcome: 'error', state: 'Failed' });

    expect(await screen.findByText('ไม่พบประกาศที่ตรงกับตัวกรอง')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรองทั้งหมด' }));
    expect(lastHref()).toBe('/admin/procurements');
  });

  test('a failed read says why and offers a retry', async () => {
    api.fetchProjects
      .mockRejectedValueOnce(new ApiError('Cannot reach the API', 0))
      .mockResolvedValue({ items: [record()], total: 1, limit: 25, offset: 0 });
    renderBrowser();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('เชื่อมต่อ API ไม่สำเร็จ');
    await userEvent.click(within(alert).getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(
      await screen.findByRole('button', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ }),
    ).toBeInTheDocument();
  });
});

describe('the URL', () => {
  test('a filter change is written to the URL and goes back to page 1', async () => {
    renderBrowser({ page: 3 });
    await screen.findByText('51–75 จาก 125');

    await userEvent.selectOptions(screen.getByLabelText('ผลการประมวลผล'), 'needs_review');

    expect(replace).toHaveBeenLastCalledWith('/admin/procurements?outcome=needs_review', {
      scroll: false,
    });
  });

  test('the search box writes its words once typing settles', async () => {
    renderBrowser({ page: 2 });
    await screen.findByText('26–50 จาก 125');

    await userEvent.type(screen.getByLabelText('ค้นหาชื่อโครงการหรือรหัส'), 'ระบบ');

    await waitFor(() =>
      expect(lastHref()).toBe(`/admin/procurements?q=${encodeURIComponent('ระบบ')}`),
    );
  });

  test('an active filter shows as a chip that removes it', async () => {
    renderBrowser({ agency: 'กรมบัญชีกลาง', status: 'open' });
    await screen.findByText('1–25 จาก 125');

    await userEvent.click(
      screen.getByRole('button', { name: 'ล้างตัวกรอง หน่วยงาน: กรมบัญชีกลาง' }),
    );

    expect(lastHref()).toBe('/admin/procurements?status=open');
  });

  test('the agency and year filters sit behind the more-filters popover', async () => {
    renderBrowser();
    await screen.findByText('1–25 จาก 125');
    expect(screen.queryByLabelText('ปีงบประมาณ')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ตัวกรองเพิ่มเติม/ }));
    await userEvent.selectOptions(await screen.findByLabelText('ปีงบประมาณ'), '2568');

    expect(lastHref()).toBe('/admin/procurements?year=2568');
  });

  test('paging keeps the filters', async () => {
    renderBrowser({ status: 'open' });
    await screen.findByText('1–25 จาก 125');

    await userEvent.click(screen.getByRole('button', { name: 'หน้าถัดไป' }));

    expect(lastHref()).toBe('/admin/procurements?status=open&page=2');
  });

  test('the dropped tab is its own view', async () => {
    tombstones.fetchTombstones.mockResolvedValue([]);
    renderBrowser();
    await screen.findByText('1–25 จาก 125');

    await userEvent.click(screen.getByRole('tab', { name: 'ถูกคัดออก' }));

    expect(lastHref()).toBe('/admin/procurements?view=dropped');
    expect(await screen.findByText('ยังไม่มีโครงการที่ถูกคัดออก')).toBeInTheDocument();
  });

  test('the tabs move with the arrow keys, and only the selected one is in the tab order', async () => {
    tombstones.fetchTombstones.mockResolvedValue([]);
    renderBrowser();
    await screen.findByText('1–25 จาก 125');

    const all = screen.getByRole('tab', { name: 'ทั้งหมด' });
    const dropped = screen.getByRole('tab', { name: 'ถูกคัดออก' });
    expect(all).toHaveAttribute('tabindex', '0');
    expect(dropped).toHaveAttribute('tabindex', '-1');

    all.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(lastHref()).toBe('/admin/procurements?view=dropped');
    expect(dropped).toHaveFocus();
    expect(dropped).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    expect(lastHref()).toBe('/admin/procurements');
    expect(all).toHaveFocus();
  });

  test('in the dropped view the header count says it counts dropped projects', async () => {
    tombstones.fetchTombstones.mockResolvedValue([
      {
        projectId: 'D1',
        reason: 'ai_not_software',
        evidence: 'จัดซื้อครุภัณฑ์',
        promptVersion: 'v1',
        decidedBy: null,
        decidedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    renderBrowser({ view: 'dropped' });

    const heading = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(heading).toHaveTextContent('ถูกคัดออก 1'));
    expect(heading).not.toHaveTextContent('125');
  });
});

describe('the drawer', () => {
  test('clicking a row opens it by writing the id to the URL, keeping the filters', async () => {
    renderBrowser({ status: 'open', page: 2 });
    await userEvent.click(
      await screen.findByRole('button', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ }),
    );

    expect(lastHref()).toBe('/admin/procurements?status=open&page=2&id=67109288963');
    const drawer = await screen.findByRole('dialog', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ });
    expect(within(drawer).getByRole('button', { name: /ดาวน์โหลด TOR/ })).toBeInTheDocument();
    expect(within(drawer).getByText(/สรุปจาก AI/)).toBeInTheDocument();
    expect(within(drawer).getByText('พัฒนาระบบบริหารงานบุคคล')).toBeInTheDocument();
  });

  test('a deep link opens it, reading the record when it is not on this page', async () => {
    const elsewhere = record({ projectId: 'P-ELSEWHERE', projectName: 'โครงการหน้าอื่น' });
    api.fetchTor.mockResolvedValue(elsewhere);
    renderBrowser({ id: 'P-ELSEWHERE' });

    expect(await screen.findByRole('dialog', { name: /โครงการหน้าอื่น/ })).toBeInTheDocument();
    expect(api.fetchTor).toHaveBeenCalledWith('P-ELSEWHERE');
  });

  test('a deep link to a record that is gone says so', async () => {
    api.fetchTor.mockRejectedValue(new ApiError('No ingested project X', 404));
    renderBrowser({ id: 'X' });

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('No ingested project X');
  });

  test('Escape closes it and drops only the id from the URL', async () => {
    renderBrowser({ outcome: 'tor_analysed', id: '67109288963' });
    await screen.findByRole('dialog', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ });

    await userEvent.keyboard('{Escape}');

    expect(lastHref()).toBe('/admin/procurements?outcome=tor_analysed');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('the history reads state, outcome and any failure reason in Thai', async () => {
    const retried = record({
      state: 'Queued',
      outcome: 'error',
      attempts: 1,
      statusHistory: [
        { state: 'Queued', outcome: 'queued', at: '2026-09-01T00:00:00.000Z' },
        { state: 'Processing', outcome: 'downloading', at: '2026-09-01T00:10:00.000Z' },
        { state: 'Queued', outcome: 'error', at: '2026-09-01T00:20:00.000Z', detail: 'HTTP 502' },
      ],
    });
    api.fetchProjects.mockResolvedValue({ items: [retried], total: 1, limit: 25, offset: 0 });
    renderBrowser({ id: retried.projectId });

    const drawer = await screen.findByRole('dialog', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ });
    const entries = within(within(drawer).getByRole('list', { name: 'ประวัติสถานะ' })).getAllByRole(
      'listitem',
    );
    expect(entries).toHaveLength(3);
    expect(entries[0]).toHaveTextContent('ดึงข้อมูลผิดพลาด (จะลองใหม่)');
    expect(entries[0]).toHaveTextContent('HTTP 502');
    expect(entries[1]).toHaveTextContent('กำลังดำเนินการ');
    expect(entries[1]).toHaveTextContent('กำลังดึงข้อมูล');
    expect(drawer).not.toHaveTextContent('Processing');
  });

  test('a held record shows why it was held and offers approval from the drawer', async () => {
    const held = record({ outcome: 'needs_review', holdReason: 'ai_low_confidence' });
    api.fetchProjects.mockResolvedValue({ items: [held], total: 1, limit: 25, offset: 0 });
    actions.approveProcurement.mockResolvedValue(undefined);
    renderBrowser({ id: held.projectId });

    const drawer = await screen.findByRole('dialog', { name: /ประกวดราคาจ้างพัฒนาระบบสารสนเทศ/ });
    expect(within(drawer).getByText(HOLD_REASON_LABELS.ai_low_confidence)).toBeInTheDocument();

    await userEvent.click(
      within(drawer).getByRole('button', { name: 'การดำเนินการกับโครงการนี้' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'อนุมัติ' }));
    const confirm = await screen.findByRole('dialog', {
      name: /อนุมัติให้เจ้าหน้าที่เห็นโครงการนี้/,
    });
    await userEvent.click(within(confirm).getByRole('button', { name: 'อนุมัติ' }));

    expect(actions.approveProcurement).toHaveBeenCalledWith(held.projectId);
    await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledTimes(2));
  });
});

describe('row actions', () => {
  test('each row has the action menu, and choosing one does not open the drawer', async () => {
    actions.deleteProcurement.mockResolvedValue(undefined);
    renderBrowser();
    await screen.findByText('1–25 จาก 125');

    const [first] = screen.getAllByRole('button', { name: 'การดำเนินการกับโครงการนี้' });
    await userEvent.click(first!);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'ลบ' }));

    expect(await screen.findByRole('dialog', { name: /ลบโครงการนี้/ })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
