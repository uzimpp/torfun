import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, fetchTorReports, reviewTorReport } from '@/lib/api';
import { TorReportsConsole } from './tor-reports-console';
import { accountNav } from '@/components/layout/nav-config';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, fetchTorReports: vi.fn(), reviewTorReport: vi.fn() };
});
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const report = {
  id: 'report-1',
  project_id: 'project-1',
  project_name: 'โครงการพัฒนาระบบ',
  dept_name: 'หน่วยงานรัฐ',
  reporter: {
    id: 'u1',
    username: 'officer',
    full_name: 'สมชาย ประเสริฐ',
    email: 'officer@example.com',
  },
  reason: 'other' as const,
  details: 'ข้อกำหนดขัดแย้งกัน',
  status: 'pending' as const,
  created_at: '2026-10-11T00:00:00.000Z',
};

test('displays the report, source TOR link, reason and reporter; supports pagination', async () => {
  vi.mocked(fetchTorReports).mockResolvedValue({
    items: [report],
    total: 26,
    limit: 25,
    offset: 0,
  });
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  expect(await screen.findByRole('link', { name: report.project_name })).toHaveAttribute(
    'href',
    '/tor/project-1',
  );
  expect(screen.getByText(report.details)).toBeInTheDocument();
  expect(screen.getByText(/สมชาย ประเสริฐ.*officer@example.com/)).toBeInTheDocument();
  expect(within(screen.getByRole('list')).getByText('รอตรวจสอบ')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
  expect(fetchTorReports).toHaveBeenLastCalledWith(25, expect.any(AbortSignal), 'pending');
});

test('shows an empty queue and can refresh it', async () => {
  vi.mocked(fetchTorReports).mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  expect(await screen.findByText('ยังไม่มีรายงาน TOR ในหน้านี้')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'รีเฟรช' }));
  expect(fetchTorReports).toHaveBeenCalledTimes(2);
});

test('shows a recoverable network error instead of an empty queue', async () => {
  vi.mocked(fetchTorReports).mockRejectedValue(new ApiError('offline', 0));
  render(<TorReportsConsole />);
  expect(await screen.findByRole('alert')).toHaveTextContent('เชื่อมต่อ API ไม่สำเร็จ');
  expect(screen.queryByText('ยังไม่มีรายงาน TOR ในหน้านี้')).not.toBeInTheDocument();
});

test('admin report navigation immediately follows the failure log and is not offered to officers', () => {
  const admin = accountNav('admin');
  const failure = admin.findIndex((item) => item.label === 'บันทึกข้อผิดพลาด');
  expect(admin[failure + 1]).toMatchObject({
    href: '/admin/tor-reports',
    label: 'รายงาน TOR จากผู้ใช้',
  });
  expect(
    accountNav('business_development_officer').some((item) => item.href === '/admin/tor-reports'),
  ).toBe(false);
});

const page = { items: [report], total: 1, limit: 25, offset: 0 };
const emptyPage = { ...page, items: [], total: 0 };

test('review requires confirmation and cancelling makes no API call', async () => {
  vi.mocked(fetchTorReports).mockResolvedValue(page);
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  await user.click(await screen.findByRole('button', { name: 'นำ TOR ออกจากการเผยแพร่' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'เจ้าหน้าที่พัฒนาธุรกิจจะเปิดหรือดาวน์โหลดไม่ได้',
  );
  expect(reviewTorReport).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'ยกเลิก' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(reviewTorReport).not.toHaveBeenCalled();
});

test('dismissal saves the note, refreshes the pending queue and confirms unchanged publication', async () => {
  vi.mocked(fetchTorReports).mockResolvedValueOnce(page).mockResolvedValue(emptyPage);
  vi.mocked(reviewTorReport).mockResolvedValue({ ...report, status: 'dismissed' });
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  await user.click(await screen.findByRole('button', { name: 'ปิดรายงาน' }));
  await user.type(
    screen.getByRole('textbox', { name: 'บันทึกการตรวจสอบ (ไม่บังคับ)' }),
    '  ตรวจสอบแล้ว  ',
  );
  await user.click(screen.getByRole('button', { name: 'ยืนยันปิดรายงาน' }));
  expect(reviewTorReport).toHaveBeenCalledWith('report-1', {
    action: 'dismiss',
    note: 'ตรวจสอบแล้ว',
  });
  expect(
    await screen.findByText('ปิดรายงานแล้ว การเผยแพร่ TOR ไม่เปลี่ยนแปลง'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await screen.findByText('ยังไม่มีรายงาน TOR ในหน้านี้')).toBeInTheDocument();
});

test('removal shows loading and prevents duplicate confirmation before success', async () => {
  vi.mocked(fetchTorReports).mockResolvedValueOnce(page).mockResolvedValue(emptyPage);
  let finish: (value: Awaited<ReturnType<typeof reviewTorReport>>) => void = () => {};
  vi.mocked(reviewTorReport).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  await user.click(await screen.findByRole('button', { name: 'นำ TOR ออกจากการเผยแพร่' }));
  await user.click(screen.getByRole('button', { name: 'ยืนยันนำ TOR ออก' }));
  expect(screen.getByRole('button', { name: 'กำลังบันทึก…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeDisabled();
  const form = screen.getByRole('button', { name: 'กำลังบันทึก…' }).closest('form');
  if (!form) throw new Error('Confirmation form missing');
  fireEvent.submit(form);
  expect(reviewTorReport).toHaveBeenCalledTimes(1);
  finish({ ...report, status: 'removed' });
  expect(await screen.findByText('นำ TOR ออกจากการเผยแพร่แล้ว')).toBeInTheDocument();
});

test('network failure retains the note and supports retry', async () => {
  vi.mocked(fetchTorReports).mockResolvedValue(page);
  vi.mocked(reviewTorReport).mockRejectedValue(new ApiError('offline', 0));
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  await user.click(await screen.findByRole('button', { name: 'ปิดรายงาน' }));
  await user.type(screen.getByRole('textbox'), 'บันทึกที่ยังไม่สำเร็จ');
  await user.click(screen.getByRole('button', { name: 'ยืนยันปิดรายงาน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('เชื่อมต่อ API ไม่สำเร็จ');
  expect(screen.getByRole('textbox')).toHaveValue('บันทึกที่ยังไม่สำเร็จ');
  expect(screen.getByRole('button', { name: 'ยืนยันปิดรายงาน' })).toBeEnabled();
});

test('a stale report refreshes the queue and cannot be decided again', async () => {
  vi.mocked(fetchTorReports).mockResolvedValueOnce(page).mockResolvedValue(emptyPage);
  vi.mocked(reviewTorReport).mockRejectedValue(
    new ApiError('รายงานนี้ได้รับการตรวจสอบแล้ว กรุณารีเฟรชรายการ', 409),
  );
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  await user.click(await screen.findByRole('button', { name: 'ปิดรายงาน' }));
  await user.click(screen.getByRole('button', { name: 'ยืนยันปิดรายงาน' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('รายงานนี้ได้รับการตรวจสอบแล้ว');
  expect(screen.getByRole('button', { name: 'ยืนยันปิดรายงาน' })).toBeDisabled();
  await waitFor(() => expect(fetchTorReports).toHaveBeenCalledTimes(2));
});

test('status filters include reviewed history with reviewer identity and no further actions', async () => {
  vi.mocked(fetchTorReports)
    .mockResolvedValueOnce(emptyPage)
    .mockResolvedValue({
      ...page,
      items: [
        {
          ...report,
          status: 'removed',
          review: {
            reviewer: {
              id: 'admin',
              username: 'reviewer',
              full_name: 'ผู้ดูแลระบบ',
              email: 'admin@example.com',
            },
            reviewed_at: '2026-10-15T00:00:00.000Z',
            note: 'ตรวจสอบเงื่อนไขแล้ว',
          },
        },
      ],
    });
  const user = userEvent.setup();
  render(<TorReportsConsole />);
  await screen.findByText('ยังไม่มีรายงาน TOR ในหน้านี้');
  await user.selectOptions(screen.getByRole('combobox', { name: 'สถานะรายงาน' }), 'all');
  expect(await screen.findByText(/ตรวจสอบโดย: ผู้ดูแลระบบ/)).toBeInTheDocument();
  expect(screen.getByText('บันทึกการตรวจสอบ: ตรวจสอบเงื่อนไขแล้ว')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ปิดรายงาน' })).not.toBeInTheDocument();
  expect(fetchTorReports).toHaveBeenLastCalledWith(0, expect.any(AbortSignal), 'all');
});
