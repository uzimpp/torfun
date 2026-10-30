import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, submitTorReport } from '@/lib/api';
import { TorReportButton } from './tor-report-button';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, submitTorReport: vi.fn() };
});
beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no native dialog implementation. Native focus/backdrop behavior
  // is checked separately in Chrome; this test covers the form state machine.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

async function open() {
  const user = userEvent.setup();
  render(<TorReportButton projectId="project-1" />);
  await user.click(screen.getByRole('button', { name: 'รายงาน TOR' }));
  return user;
}

test('requires a single reason and requires nonblank details for other', async () => {
  const user = await open();
  await user.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(screen.getByRole('alert')).toHaveTextContent('กรุณาเลือกเหตุผล');
  await user.click(screen.getByRole('radio', { name: 'ข้อมูล TOR ไม่ถูกต้อง' }));
  await user.click(screen.getByRole('radio', { name: 'อื่นๆ' }));
  expect(screen.getByRole('radio', { name: 'ข้อมูล TOR ไม่ถูกต้อง' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'อื่นๆ' })).toBeChecked();
  await user.type(screen.getByRole('textbox'), '   ');
  await user.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(screen.getByRole('alert')).toHaveTextContent('กรุณาระบุรายละเอียด');
  expect(submitTorReport).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('Escape and outside clicks do not close; the provided close button does', async () => {
  const user = await open();
  const dialog = screen.getByRole('dialog');
  const event = new Event('cancel', { cancelable: true });
  expect(dialog.dispatchEvent(event)).toBe(false);
  await user.click(document.body);
  expect(dialog).toHaveAttribute('open');
  await user.click(screen.getByRole('button', { name: 'ปิด' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('shows loading, blocks repeat submissions, closes after persistence and shows a toast', async () => {
  const user = await open();
  let resolve!: (value: Awaited<ReturnType<typeof submitTorReport>>) => void;
  vi.mocked(submitTorReport).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await user.click(screen.getByRole('radio', { name: 'อื่นๆ' }));
  await user.type(screen.getByRole('textbox'), '  ข้อกำหนดขัดแย้งกัน  ');
  await user.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(screen.getByRole('button', { name: 'กำลังส่งรายงาน…' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: 'กำลังส่งรายงาน…' }).closest('form')!);
  expect(submitTorReport).toHaveBeenCalledTimes(1);
  expect(submitTorReport).toHaveBeenCalledWith('project-1', {
    reason: 'other',
    details: 'ข้อกำหนดขัดแย้งกัน',
  });
  resolve({
    id: 'report-1',
    project_id: 'project-1',
    project_name: 'ระบบ',
    dept_name: 'รัฐ',
    reporter: { id: 'u1', username: 'tester', full_name: '', email: null },
    reason: 'other',
    details: 'ข้อกำหนดขัดแย้งกัน',
    status: 'pending',
    created_at: '2026-10-11T00:00:00.000Z',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('status')).toHaveTextContent('ส่งรายงานแล้ว');
  expect(screen.getByRole('button', { name: 'ส่งรายงาน TOR แล้ว' })).toBeDisabled();
});

test('a failed request keeps the form and details for retry', async () => {
  vi.mocked(submitTorReport).mockRejectedValueOnce(new ApiError('offline', 0));
  const user = await open();
  await user.click(screen.getByRole('radio', { name: 'อื่นๆ' }));
  await user.type(screen.getByRole('textbox'), 'รายละเอียดที่ไม่ควรหาย');
  await user.click(screen.getByRole('button', { name: 'ส่งรายงาน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('เชื่อมต่อ API ไม่สำเร็จ');
  expect(screen.getByRole('textbox')).toHaveValue('รายละเอียดที่ไม่ควรหาย');
  expect(screen.getByRole('button', { name: 'ส่งรายงาน' })).toBeEnabled();
});
