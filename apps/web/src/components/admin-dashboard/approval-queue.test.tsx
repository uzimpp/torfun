import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HOLD_REASON_LABELS, STATUS_LABELS, type Procurement } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { ApprovalQueue, QUEUE_SHOWN } from './approval-queue';

vi.mock('@/lib/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/api')>('@/lib/api')),
  fetchProjects: vi.fn(),
  downloadTor: vi.fn(),
}));
vi.mock('@/lib/api-procurement-actions', () => ({
  approveProcurement: vi.fn(),
  markNonSoftware: vi.fn(),
  deleteProcurement: vi.fn(),
}));
const api = vi.mocked(await import('@/lib/api'));
const actions = vi.mocked(await import('@/lib/api-procurement-actions'));

const NOW = new Date('2026-10-04T10:00:00.000Z');

const held = (overrides: Partial<Procurement> = {}) =>
  ({
    projectId: '66059313551',
    projectName: 'จ้างบำรุงรักษาระบบเครือข่ายและซอฟต์แวร์',
    deptName: 'กรมตัวอย่าง',
    projectMoney: 1_250_000,
    status: 'open',
    deadlineAt: '2026-10-10T03:00:00.000Z',
    deadlineSource: 'invitation',
    outcome: 'needs_review',
    holdReason: 'ai_low_confidence',
    zipId: 'Z1',
    documents: [{ member: 'tor.pdf', filename: 'tor.pdf', role: 'main_tor' }],
    analysis: {
      summary: 'จัดหาระบบบริหารงานบุคคลบนเว็บ พร้อมบำรุงรักษา 1 ปี',
      reason: 'ขอบเขตงาน “ติดตั้งอุปกรณ์และพัฒนาโปรแกรม” ปะปนกัน',
    },
    ...overrides,
  }) as Procurement;

const list = (items: Procurement[], total = items.length) => ({
  items,
  total,
  limit: 50,
  offset: 0,
});

/** Resolves when the test says so, to look at the in-between state. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const queue = (onChanged = vi.fn(), heldCount = 1) => (
  <ApprovalQueue
    lastRunAt="2026-10-04T09:00:00.000Z"
    now={NOW}
    heldCount={heldCount}
    onChanged={onChanged}
  />
);

const renderQueue = (onChanged = vi.fn(), heldCount = 1) => render(queue(onChanged, heldCount));

async function confirm(row: HTMLElement, action: string) {
  await userEvent.click(within(row).getByRole('button', { name: action }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: action }));
}

beforeEach(() => vi.resetAllMocks());

describe('ApprovalQueue', () => {
  test('reads the held records only', async () => {
    api.fetchProjects.mockResolvedValue(list([]));
    renderQueue();

    await screen.findByText('ไม่มีรายการรอตรวจสอบ');
    expect(api.fetchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'needs_review' }),
    );
  });

  test('empty, it says so and when the last run was', async () => {
    api.fetchProjects.mockResolvedValue(list([]));
    renderQueue();

    expect(await screen.findByText('ไม่มีรายการรอตรวจสอบ')).toBeInTheDocument();
    expect(screen.getByText(/รอบล่าสุด 1 ชั่วโมงที่แล้ว/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /ดูทั้งหมด/ })).not.toBeInTheDocument();
  });

  test('keeps the order the server sends: it ranks the held list by urgency', async () => {
    api.fetchProjects.mockResolvedValue(
      list([
        held({ projectId: 'awarded', projectName: 'ก ประกาศผู้ชนะแล้ว', status: 'awarded' }),
        held({
          projectId: 'soon',
          projectName: 'ง เปิดรับ ปิดเร็ว',
          deadlineAt: '2026-10-05T03:00:00.000Z',
        }),
      ]),
    );
    renderQueue();

    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'ก ประกาศผู้ชนะแล้ว',
      'ง เปิดรับ ปิดเร็ว',
    ]);
  });

  test('shows at most a handful, with a link to the whole list', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      held({ projectId: `p${index}`, projectName: `โครงการ ${index}` }),
    );
    api.fetchProjects.mockResolvedValue(list(many, 37));
    renderQueue();

    expect(await screen.findAllByRole('listitem')).toHaveLength(QUEUE_SHOWN);
    expect(screen.getByRole('link', { name: 'ดูทั้งหมด (37)' })).toHaveAttribute(
      'href',
      '/admin/procurements?outcome=needs_review',
    );
  });

  test('each item carries what a decision needs, the AI’s words labelled as a summary', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    renderQueue();

    const row = await screen.findByRole('listitem');
    expect(within(row).getByRole('heading')).toHaveTextContent(
      'จ้างบำรุงรักษาระบบเครือข่ายและซอฟต์แวร์',
    );
    expect(row).toHaveTextContent('กรมตัวอย่าง');
    expect(row).toHaveTextContent('1,250,000');
    expect(row).toHaveTextContent(STATUS_LABELS.open);
    expect(row).toHaveTextContent('ประกาศเชิญชวน');
    expect(row).toHaveTextContent(HOLD_REASON_LABELS.ai_low_confidence);
    expect(row).toHaveTextContent('เหตุผลจาก AI (สรุป ไม่ใช่ข้อยืนยัน)');
    expect(row).toHaveTextContent('ติดตั้งอุปกรณ์และพัฒนาโปรแกรม');
    expect(row).toHaveTextContent('จัดหาระบบบริหารงานบุคคลบนเว็บ');
  });

  test('actions come in order: the source TOR first, then approve, not software, details', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    renderQueue();

    const row = await screen.findByRole('listitem');
    const controls = within(row)
      .getAllByRole('button')
      .concat(within(row).getAllByRole('link'))
      .map((element) => element.textContent?.trim());
    expect(controls).toEqual([
      'ดาวน์โหลด TOR ต้นฉบับ',
      'อนุมัติ',
      'ระบุว่าไม่ใช่ซอฟต์แวร์',
      'ดูรายละเอียด',
    ]);
    expect(within(row).getByRole('link', { name: 'ดูรายละเอียด' })).toHaveAttribute(
      'href',
      '/admin/procurements?id=66059313551',
    );
  });

  test('without a main TOR there is no source button to fail, and it says why', async () => {
    api.fetchProjects.mockResolvedValue(list([held({ zipId: null, documents: [] })]));
    renderQueue();

    const row = await screen.findByRole('listitem');
    expect(within(row).queryByRole('button', { name: /TOR ต้นฉบับ/ })).not.toBeInTheDocument();
    expect(row).toHaveTextContent('ยังไม่มีเอกสาร TOR ต้นฉบับ');
  });

  test('a record the model gave no reason for lists without an invented one', async () => {
    api.fetchProjects.mockResolvedValue(
      list([held({ analysis: null, holdReason: 'partial_read' })]),
    );
    renderQueue();

    const row = await screen.findByRole('listitem');
    expect(row).toHaveTextContent(HOLD_REASON_LABELS.partial_read);
    expect(row).not.toHaveTextContent('เหตุผลจาก AI');
  });

  test('approving asks first; once confirmed the row is busy, then gone, and it is announced', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    const request = deferred();
    actions.approveProcurement.mockReturnValue(request.promise);
    const onChanged = vi.fn();
    renderQueue(onChanged);

    const row = await screen.findByRole('listitem');
    await userEvent.click(within(row).getByRole('button', { name: 'อนุมัติ' }));
    expect(actions.approveProcurement).not.toHaveBeenCalled();
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'อนุมัติ' }),
    );

    expect(actions.approveProcurement).toHaveBeenCalledWith('66059313551');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(within(row).getByRole('button', { name: 'อนุมัติ' })).toBeDisabled();

    request.resolve();

    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(
      'อนุมัติแล้ว — เจ้าหน้าที่เห็นโครงการนี้แล้ว',
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText('ไม่มีรายการรอตรวจสอบ')).toBeInTheDocument();
  });

  test('marking as non-software sends it once confirmed and reports the change', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    actions.markNonSoftware.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    renderQueue(onChanged);

    await confirm(await screen.findByRole('listitem'), 'ระบุว่าไม่ใช่ซอฟต์แวร์');

    expect(actions.markNonSoftware).toHaveBeenCalledWith('66059313551');
    expect(actions.approveProcurement).not.toHaveBeenCalled();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  test('a refused decision puts the row back, with the reason beside it', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    actions.markNonSoftware.mockRejectedValue(new ApiError('Record changed', 409));
    const onChanged = vi.fn();
    renderQueue(onChanged);

    await confirm(await screen.findByRole('listitem'), 'ระบุว่าไม่ใช่ซอฟต์แวร์');

    const row = await screen.findByRole('listitem');
    expect(await within(row).findByRole('alert')).toHaveTextContent('Record changed');
    expect(row).not.toHaveAttribute('aria-busy');
    expect(within(row).getByRole('button', { name: 'อนุมัติ' })).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('the non-software dialog says that undoing it means downloading again', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    renderQueue();

    const row = await screen.findByRole('listitem');
    await userEvent.click(within(row).getByRole('button', { name: 'ระบุว่าไม่ใช่ซอฟต์แวร์' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('ดาวน์โหลด');
  });

  test('an ended session during a decision offers sign-in, not a retry', async () => {
    api.fetchProjects.mockResolvedValue(list([held()]));
    actions.approveProcurement.mockRejectedValue(new SessionEndedError());
    renderQueue();

    await confirm(await screen.findByRole('listitem'), 'อนุมัติ');

    const row = await screen.findByRole('listitem');
    expect(await within(row).findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(within(row).getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  test('a run that holds more records reads the queue again', async () => {
    api.fetchProjects.mockResolvedValueOnce(list([held({ projectId: 'a' })]));
    api.fetchProjects.mockResolvedValueOnce(
      list([held({ projectId: 'a' }), held({ projectId: 'b', projectName: 'โครงการใหม่' })]),
    );
    const { rerender } = renderQueue(vi.fn(), 1);
    expect(await screen.findAllByRole('listitem')).toHaveLength(1);

    rerender(queue(vi.fn(), 2));

    expect(await screen.findByRole('heading', { name: 'โครงการใหม่' })).toBeInTheDocument();
    expect(api.fetchProjects).toHaveBeenCalledTimes(2);
  });

  test('once the server has dropped a decided record, the count is not reduced twice', async () => {
    const onChanged = vi.fn();
    api.fetchProjects.mockResolvedValueOnce(
      list([held({ projectId: 'a' }), held({ projectId: 'b' }), held({ projectId: 'c' })]),
    );
    api.fetchProjects.mockResolvedValueOnce(
      list([
        held({ projectId: 'b' }),
        held({ projectId: 'c' }),
        held({ projectId: 'd', projectName: 'ถือไว้ในรอบใหม่' }),
      ]),
    );
    actions.approveProcurement.mockResolvedValue(undefined);
    const { rerender } = renderQueue(onChanged, 3);

    const [first] = await screen.findAllByRole('listitem');
    await confirm(first!, 'อนุมัติ');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('รอตรวจสอบ2');

    rerender(queue(onChanged, 2));

    expect(await screen.findByRole('heading', { name: 'ถือไว้ในรอบใหม่' })).toBeInTheDocument();
    expect(heading).toHaveTextContent('รอตรวจสอบ3');
  });

  test('a failure to load is announced, with a way to try again', async () => {
    api.fetchProjects.mockRejectedValueOnce(new ApiError('Cannot reach the API', 0));
    api.fetchProjects.mockResolvedValueOnce(list([]));
    renderQueue();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(await screen.findByText('ไม่มีรายการรอตรวจสอบ')).toBeInTheDocument();
  });
  test('an ended session while loading offers sign-in instead of a retry', async () => {
    api.fetchProjects.mockRejectedValue(new SessionEndedError());
    renderQueue();

    expect(await screen.findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).not.toBeInTheDocument();
  });
});
