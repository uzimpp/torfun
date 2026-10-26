import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  defaultNotificationPreferences,
  type NotificationListResponse,
  type NotificationSettingsResponse,
} from '@torfun/types';
import * as api from '@/lib/api';
import { Inbox } from './inbox';
import { NotificationPreferencesPanel } from './notification-preferences';

vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  fetchNotifications: vi.fn(),
  fetchNotificationSettings: vi.fn(),
  readAllNotifications: vi.fn(),
  updateNotification: vi.fn(),
  verifyNotificationEmail: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  requestNotificationEmail: vi.fn(),
  disconnectNotificationChannel: vi.fn(),
}));
const settings: NotificationSettingsResponse = {
  preferences: defaultNotificationPreferences(),
  match_threshold: 0.7,
  email: null,
  email_verified: false,
  email_available: false,
  line_available: false,
  line_linked: false,
  line_connected: false,
  line_add_friend_url: null,
};
const populated: NotificationListResponse = {
  total: 1,
  unread_count: 1,
  items: [
    {
      id: 'a'.repeat(64),
      project_id: '69100000001',
      project_name: 'พัฒนาเว็บกรมทดสอบ',
      event: 'match_found',
      score: 0.7,
      reasons: ['เทคโนโลยีที่ตรงกับผลงาน: React'],
      previous_status: null,
      status: 'invitation',
      deadline_at: null,
      read_at: null,
      created_at: '2026-10-26T00:00:00Z',
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchNotifications).mockResolvedValue(populated);
  vi.mocked(api.fetchNotificationSettings).mockResolvedValue(settings);
  vi.mocked(api.updateNotification).mockResolvedValue({ ok: true });
  vi.mocked(api.readAllNotifications).mockResolvedValue({ ok: true });
});
describe('notification inbox', () => {
  it('allows unlinking a LINE account even after the OA was blocked or unfollowed', async () => {
    const user = userEvent.setup();
    render(
      <NotificationPreferencesPanel
        settings={{ ...settings, line_available: true, line_linked: true }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/บัญชีเชื่อมต่อแล้ว แต่หยุดรับข้อความ/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ยกเลิกการเชื่อมต่อ LINE' }));
    expect(api.disconnectNotificationChannel).toHaveBeenCalledWith('line');
  });
  it('renders evidence, an authenticated detail link and channel configuration status', async () => {
    render(<Inbox />);
    const link = await screen.findByRole('link', { name: 'พัฒนาเว็บกรมทดสอบ' });
    expect(link).toHaveAttribute('href', '/tor/69100000001');
    expect(screen.getByText(/คะแนนเทคโนโลยีและแพลตฟอร์ม 70%/)).toBeInTheDocument();
    expect(screen.getByText('ผู้ดูแลระบบยังไม่ได้ตั้งค่าการส่งอีเมล')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'อีเมล : พบ TOR ที่ตรงกับบริษัท' })).toBeDisabled();
  });
  it('supports read-all, dismissal and unread filtering through API actions', async () => {
    const user = userEvent.setup();
    render(<Inbox />);
    await screen.findByRole('link', { name: 'พัฒนาเว็บกรมทดสอบ' });
    await user.click(screen.getByRole('button', { name: 'อ่านทั้งหมด' }));
    expect(api.readAllNotifications).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /ซ่อนการแจ้งเตือน/ }));
    expect(api.updateNotification).toHaveBeenCalledWith('a'.repeat(64), 'dismiss');
    await user.click(screen.getByRole('button', { name: 'ยังไม่อ่าน' }));
    await waitFor(() => expect(api.fetchNotifications).toHaveBeenCalledWith('unread', 0));
  });
  it('shows an honest empty inbox without invented opportunities', async () => {
    vi.mocked(api.fetchNotifications).mockResolvedValue({ items: [], total: 0, unread_count: 0 });
    render(<Inbox />);
    expect(await screen.findByText('ยังไม่มีการแจ้งเตือน')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ตรวจสอบข้อมูลบริษัทและผลงาน' })).toHaveAttribute(
      'href',
      '/company',
    );
  });
  it('surfaces session expiry rather than showing an empty successful result', async () => {
    vi.mocked(api.fetchNotifications).mockRejectedValue(new api.ApiError('expired', 401));
    render(<Inbox />);
    expect(await screen.findByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
    expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
  });
  it('requires an explicit POST to confirm an email token', async () => {
    const user = userEvent.setup();
    vi.mocked(api.verifyNotificationEmail).mockResolvedValue({ ...settings, email_verified: true });
    render(<Inbox verificationToken={'x'.repeat(43)} />);
    expect(api.verifyNotificationEmail).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'ยืนยันอีเมล' }));
    expect(api.verifyNotificationEmail).toHaveBeenCalledWith('x'.repeat(43));
    expect(
      await screen.findByText('ยืนยันอีเมลแล้ว คุณสามารถเปิดการแจ้งเตือนทางอีเมลได้'),
    ).toBeInTheDocument();
  });
  it('email-only preferences remain selectable when in-app is off', async () => {
    const user = userEvent.setup();
    const configured = {
      ...settings,
      email: 'officer@example.test',
      email_available: true,
      email_verified: true,
    };
    vi.mocked(api.saveNotificationPreferences).mockResolvedValue(configured);
    render(<NotificationPreferencesPanel settings={configured} onSaved={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'พบ TOR ที่ตรงกับบริษัท' });
    await user.click(within(group).getByRole('checkbox', { name: /ในระบบ/ }));
    await user.click(within(group).getByRole('checkbox', { name: /อีเมล/ }));
    await user.click(screen.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }));
    await waitFor(() =>
      expect(api.saveNotificationPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ match_found: { in_app: false, email: true, line: false } }),
      ),
    );
  });
});
