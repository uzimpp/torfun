import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import { ApiError, type AdminUserResponse } from '@/lib/api';
import { AccountsConsole } from './accounts-console';

/**
 * The API does not exist as far as these tests are concerned. What is checked
 * is what a Site Administrator can see and do: the two rows they may never
 * touch (their own, and the last active administrator's), and that a real
 * change goes to the client boundary as one patch.
 */
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, fetchAdminUsers: vi.fn(), updateAdminUser: vi.fn() };
});

const api = await import('@/lib/api');
const mocked = vi.mocked(api);

function account(over: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id: 'u1',
    username: 'somchai',
    first_name: 'สมชาย',
    last_name: 'ประเสริฐ',
    full_name: 'สมชาย ประเสริฐ',
    email: null,
    role: 'business_development_officer',
    is_active: true,
    company_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const rowFor = (name: string) =>
  screen.findByRole('row', { name: new RegExp(name) });

beforeEach(() => {
  vi.clearAllMocks();
});

test('every account shows its role and whether it can still sign in', async () => {
  mocked.fetchAdminUsers.mockResolvedValue({
    users: [
      account({ id: 'admin1', username: 'root', role: 'admin' }),
      account({ id: 'u2', username: 'malee', is_active: false }),
    ],
  });

  render(<AccountsConsole currentUserId="nobody" />);

  expect(await within(await rowFor('root')).findByText('ผู้ดูแลระบบ')).toBeInTheDocument();
  expect(within(await rowFor('malee')).getByText('ถูกระงับ')).toBeInTheDocument();
});

test("the administrator's own row cannot be edited", async () => {
  mocked.fetchAdminUsers.mockResolvedValue({
    users: [
      account({ id: 'me', username: 'root', role: 'admin' }),
      account({ id: 'other', username: 'malee', role: 'admin' }),
    ],
  });

  render(<AccountsConsole currentUserId="me" />);
  const own = within(await rowFor('root'));

  expect(own.getByRole('button', { name: 'ถอนสิทธิ์ผู้ดูแล' })).toBeDisabled();
  expect(own.getByRole('button', { name: 'ระงับบัญชี' })).toBeDisabled();
  expect(own.getByText(/บัญชีของคุณ/)).toBeInTheDocument();
});

test('the last active administrator cannot be demoted or suspended', async () => {
  mocked.fetchAdminUsers.mockResolvedValue({
    users: [
      account({ id: 'lone', username: 'root', role: 'admin' }),
      account({ id: 'ghost', username: 'ghost', role: 'admin', is_active: false }),
    ],
  });

  render(<AccountsConsole currentUserId="someone-else" />);
  const lone = within(await rowFor('root'));

  expect(lone.getByRole('button', { name: 'ถอนสิทธิ์ผู้ดูแล' })).toBeDisabled();
  expect(lone.getByRole('button', { name: 'ระงับบัญชี' })).toBeDisabled();
  // The deactivated second admin can still be re-enabled — it is not the block.
  expect(
    within(await rowFor('ghost')).getByRole('button', { name: 'เปิดใช้งาน' }),
  ).toBeEnabled();
});

test('promoting an officer sends one patch and updates the row', async () => {
  mocked.fetchAdminUsers.mockResolvedValue({
    users: [
      account({ id: 'admin1', username: 'root', role: 'admin' }),
      account({ id: 'u2', username: 'malee' }),
    ],
  });
  mocked.updateAdminUser.mockResolvedValue(
    account({ id: 'u2', username: 'malee', role: 'admin' }),
  );

  render(<AccountsConsole currentUserId="admin1" />);
  const row = within(await rowFor('malee'));

  await userEvent.click(row.getByRole('button', { name: 'ตั้งเป็นผู้ดูแลระบบ' }));

  expect(mocked.updateAdminUser).toHaveBeenCalledWith('u2', { role: 'admin' });
  expect(await within(await rowFor('malee')).findByText('ผู้ดูแลระบบ')).toBeInTheDocument();
});

test("a refused change surfaces the API's message", async () => {
  mocked.fetchAdminUsers.mockResolvedValue({
    users: [
      account({ id: 'admin1', username: 'root', role: 'admin' }),
      account({ id: 'u2', username: 'malee' }),
    ],
  });
  mocked.updateAdminUser.mockRejectedValue(
    new ApiError('The last active administrator cannot be demoted or deactivated', 409),
  );

  render(<AccountsConsole currentUserId="admin1" />);
  const row = within(await rowFor('malee'));

  await userEvent.click(row.getByRole('button', { name: 'ระงับบัญชี' }));

  expect(
    await screen.findByText('The last active administrator cannot be demoted or deactivated'),
  ).toBeInTheDocument();
});
