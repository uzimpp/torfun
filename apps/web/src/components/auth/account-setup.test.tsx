import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultNotificationPreferences } from '@torfun/types';
import * as api from '@/lib/api';
import { AccountSetup } from './account-setup';
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {},
  SessionEndedError: class extends Error {},
  fetchCompanyQualifications: vi.fn(),
  fetchExperiences: vi.fn(),
  fetchNotificationSettings: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  requestNotificationEmail: vi.fn(),
  disconnectNotificationChannel: vi.fn(),
}));
const settings = () => ({
  preferences: defaultNotificationPreferences(),
  match_threshold: 0.7,
  email: null,
  email_verified: false,
  email_available: false,
  line_available: false,
  line_linked: false,
  line_connected: false,
  line_add_friend_url: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchNotificationSettings).mockResolvedValue(settings());
  vi.mocked(api.fetchCompanyQualifications).mockResolvedValue({
    companyId: 'company',
    revision: null,
    registeredCapitalThb: null,
    bidBudgetMinThb: null,
    bidBudgetMaxThb: null,
    personnel: [],
    certificates: [
      { name: 'Expired', standard: 'ISO 9001', issuer: 'test', validUntil: '2000-01-01' },
    ],
  });
  vi.mocked(api.fetchExperiences).mockResolvedValue({ experiences: [] });
  vi.mocked(api.saveNotificationPreferences).mockResolvedValue(settings());
});
test('loads real checklist state and saves independent new-TOR preferences with filters', async () => {
  const user = userEvent.setup();
  render(<AccountSetup hasCompany />);
  expect(await screen.findByText('ตัวกรองสำหรับทุกประเภทการแจ้งเตือน')).toBeInTheDocument();
  const certificate = screen
    .getByRole('link', { name: 'ใบรับรองบริษัทที่ยังไม่หมดอายุ' })
    .closest('li')!;
  expect(within(certificate).getByText('ยังไม่ครบ')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: /ในระบบ.*TOR เปิดรับข้อเสนอใหม่/ }));
  await user.type(
    screen.getByLabelText('หน่วยงาน (ชื่อเต็ม คั่นด้วยจุลภาค)'),
    'กรม ทดสอบ, กรมอื่น',
  );
  await user.type(screen.getByLabelText('งบประมาณขั้นต่ำ (บาท)'), '500000');
  await user.type(screen.getByLabelText('งบประมาณสูงสุด (บาท)'), '1000000');
  await user.click(screen.getByRole('checkbox', { name: 'เว็บ' }));
  await user.type(screen.getByLabelText('คะแนนคุณสมบัติขั้นต่ำ (%)'), '80');
  await user.click(screen.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }));
  await waitFor(() =>
    expect(api.saveNotificationPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        new_open: { in_app: true, email: false, line: false },
        filters: {
          agencies: ['กรม ทดสอบ', 'กรมอื่น'],
          min_budget: 500000,
          max_budget: 1000000,
          work_types: ['web_app'],
          min_qualification_score: 0.8,
        },
      }),
    ),
  );
});
test('an officer without a company can configure notifications without company-only requests', async () => {
  render(<AccountSetup hasCompany={false} />);
  await screen.findByText('ตัวกรองสำหรับทุกประเภทการแจ้งเตือน');
  expect(api.fetchCompanyQualifications).not.toHaveBeenCalled();
  expect(api.fetchExperiences).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'เข้าร่วมบริษัท' })).toHaveAttribute(
    'href',
    '/company-experiences',
  );
});
test('shows a load failure instead of inventing checklist completion', async () => {
  vi.mocked(api.fetchCompanyQualifications).mockRejectedValue(new Error('offline'));
  render(<AccountSetup hasCompany />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('พร้อมแล้ว')).not.toBeInTheDocument();
});
