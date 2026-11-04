import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import LoginPage from './login/page';
import RegisterPage from './register/page';
import SignupPage from './signup/page';
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => router, redirect }));
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
  });
});

test('registration presents itself as the first of three steps', () => {
  render(<RegisterPage />);
  const steps = screen.getByRole('navigation', { name: 'ขั้นตอนการตั้งค่าบัญชี' });
  expect(within(steps).getByText(/^ขั้นตอนที่ 1: บัญชีผู้ใช้/)).toBeInTheDocument();
  expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('บัญชีผู้ใช้');
});

test('the signup route hands people to the one registration page', () => {
  SignupPage();
  expect(redirect).toHaveBeenCalledWith('/register');
});

test('both credential pages offer the same Google route, worded for what it does', () => {
  render(<RegisterPage />);
  expect(screen.getByRole('button', { name: 'สมัครด้วยบัญชี Google' })).toBeInTheDocument();
  cleanup();

  render(<LoginPage />);
  expect(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeInTheDocument();
  // Signing in with Google creates the account on first use, so the page says so.
  expect(screen.getByText('ใช้ Google ครั้งแรกจะสร้างบัญชีให้อัตโนมัติ')).toBeInTheDocument();
});

test('signing in is not presented as a step of registration', () => {
  render(<LoginPage />);
  expect(
    screen.queryByRole('navigation', { name: 'ขั้นตอนการตั้งค่าบัญชี' }),
  ).not.toBeInTheDocument();
});
