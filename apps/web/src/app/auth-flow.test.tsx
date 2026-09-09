import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import LoginPage from './login/page';
import RegisterPage from './register/page';
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test('successful login posts credentials then opens and refreshes the dashboard', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'bd-user' } });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/auth/login'),
    expect.objectContaining({
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ username: 'bd-user', password: 'test-password' }),
    }),
  );
});
test('failed login stays on the form with an error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง' }), { status: 401 }),
      ),
  );
  render(<LoginPage />);
  fireEvent.submit(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('ข้อมูลเข้าสู่ระบบไม่ถูกต้อง');
  expect(router.push).not.toHaveBeenCalled();
});
test('registration keeps snake_case wire fields and redirects to dashboard', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<RegisterPage />);
  for (const [label, value] of [
    ['ชื่อ', 'Test'],
    ['นามสกุล', 'User'],
    ['ชื่อผู้ใช้', 'bd-user'],
    ['รหัสผ่าน', 'test-password'],
    ['ยืนยันรหัสผ่าน', 'test-password'],
    ['ชื่อบริษัท / ธุรกิจ', 'Test company'],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'สร้างบัญชีผู้ใช้' }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'));
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
    username: 'bd-user',
    password: 'test-password',
    confirm_password: 'test-password',
    first_name: 'Test',
    last_name: 'User',
    company_name: 'Test company',
  });
});
