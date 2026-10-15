import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, fetchTorReports } from '@/lib/api';
import { TorReportsConsole } from './tor-reports-console';
import { accountNav } from '@/components/layout/nav-config';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, fetchTorReports: vi.fn() };
});
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

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
  expect(screen.getByText('รอตรวจสอบ')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'ถัดไป' }));
  expect(fetchTorReports).toHaveBeenLastCalledWith(25, expect.any(AbortSignal));
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
