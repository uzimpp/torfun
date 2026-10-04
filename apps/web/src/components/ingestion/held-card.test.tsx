import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HOLD_REASON_LABELS, type Procurement } from '@torfun/types';

import { ApiError, SessionEndedError } from '@/lib/api';
import { HeldCard } from './held-card';

/**
 * What an administrator sees of the records the pipeline would not decide: why
 * each is held, what the model said, a way to read the source, and the two
 * decisions open to a person.
 */
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

const heldRecord = (overrides: Partial<Procurement> = {}) =>
  ({
    projectId: '66059313551',
    projectName: 'จ้างบำรุงรักษาระบบเครือข่ายและซอฟต์แวร์',
    deptName: 'กรมตัวอย่าง',
    outcome: 'needs_review',
    holdReason: 'ai_low_confidence',
    analysis: { reason: 'ขอบเขตงาน “ติดตั้งอุปกรณ์และพัฒนาโปรแกรม” ปะปนกัน' },
    ...overrides,
  }) as Procurement;

const list = (items: Procurement[], total = items.length) => ({
  items,
  total,
  limit: 50,
  offset: 0,
});

beforeEach(() => vi.resetAllMocks());

describe('HeldCard', () => {
  test('asks the API for the held records only', async () => {
    api.fetchProjects.mockResolvedValue(list([]));
    render(<HeldCard reloadKey={0} onChanged={() => {}} />);

    expect(await screen.findByText('ไม่มีโครงการที่รอตรวจสอบ')).toBeInTheDocument();
    expect(api.fetchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'needs_review' }),
    );
  });

  test('shows each held record with the fixed reason, the model’s reason and a way to the source', async () => {
    api.fetchProjects.mockResolvedValue(list([heldRecord()]));
    render(<HeldCard reloadKey={0} onChanged={() => {}} />);

    const row = await screen.findByRole('listitem');
    expect(within(row).getByText('จ้างบำรุงรักษาระบบเครือข่ายและซอฟต์แวร์')).toBeInTheDocument();
    expect(within(row).getByText(HOLD_REASON_LABELS.ai_low_confidence)).toBeInTheDocument();
    expect(within(row).getByText(/ติดตั้งอุปกรณ์และพัฒนาโปรแกรม/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /ดาวน์โหลด TOR/ })).toBeInTheDocument();
  });

  test('a record the model left no reason for still lists, without an invented one', async () => {
    api.fetchProjects.mockResolvedValue(
      list([heldRecord({ analysis: null, holdReason: 'partial_read' })]),
    );
    render(<HeldCard reloadKey={0} onChanged={() => {}} />);

    const row = await screen.findByRole('listitem');
    expect(within(row).getByText(HOLD_REASON_LABELS.partial_read)).toBeInTheDocument();
    expect(within(row).queryByText(/เหตุผลจาก AI/)).not.toBeInTheDocument();
  });

  test('approving asks first, then approves, reloads the list and tells the console', async () => {
    api.fetchProjects.mockResolvedValueOnce(list([heldRecord()])).mockResolvedValueOnce(list([]));
    actions.approveProcurement.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<HeldCard reloadKey={0} onChanged={onChanged} />);

    await userEvent.click(await screen.findByRole('button', { name: 'อนุมัติ' }));
    const dialog = await screen.findByRole('dialog');
    expect(actions.approveProcurement).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'อนุมัติ' }));

    expect(actions.approveProcurement).toHaveBeenCalledWith('66059313551');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  test('marking as non-software goes through its own confirmation', async () => {
    api.fetchProjects.mockResolvedValue(list([heldRecord()]));
    actions.markNonSoftware.mockResolvedValue(undefined);
    render(<HeldCard reloadKey={0} onChanged={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: 'ระบุว่าไม่ใช่ซอฟต์แวร์' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'ระบุว่าไม่ใช่ซอฟต์แวร์' }));

    expect(actions.markNonSoftware).toHaveBeenCalledWith('66059313551');
  });

  test('reads the list again when the console says something changed elsewhere', async () => {
    api.fetchProjects.mockResolvedValue(list([]));
    const { rerender } = render(<HeldCard reloadKey={0} onChanged={() => {}} />);
    await screen.findByText('ไม่มีโครงการที่รอตรวจสอบ');

    rerender(<HeldCard reloadKey={1} onChanged={() => {}} />);

    await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledTimes(2));
  });

  test('a failure to load is announced, with a way to try again', async () => {
    api.fetchProjects.mockRejectedValueOnce(new ApiError('Cannot reach the API', 0));
    api.fetchProjects.mockResolvedValueOnce(list([]));
    render(<HeldCard reloadKey={0} onChanged={() => {}} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่สามารถโหลด');
    await userEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
    expect(await screen.findByText('ไม่มีโครงการที่รอตรวจสอบ')).toBeInTheDocument();
  });

  test('an ended session while loading offers sign-in instead of a retry', async () => {
    api.fetchProjects.mockRejectedValue(new SessionEndedError());
    render(<HeldCard reloadKey={0} onChanged={() => {}} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).not.toBeInTheDocument();
  });
});
