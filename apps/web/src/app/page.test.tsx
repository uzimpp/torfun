import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Home from './page';
import LoginLayout from './login/layout';
import RegisterLayout from './register/layout';
const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: auth.getCurrentUser }));
vi.mock('next/navigation', () => ({ redirect: auth.redirect }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(null);
});
describe('guest routes', () => {
  test('shows public content and working auth links to guests', async () => {
    render(await Home());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ค้นหาโอกาสจาก TOR');
    expect(screen.getAllByRole('region')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /เริ่มต้นใช้งาน/ })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByText(/ผลสรุปจาก AI เป็นข้อมูลช่วยอ่าน/)).toBeInTheDocument();
  });
  test.each(['admin', 'business_development_officer'])(
    'redirects %s away from landing and auth forms',
    async (role) => {
      auth.getCurrentUser.mockResolvedValue({ username: 'test-user', role });
      for (const renderPage of [
        () => Home(),
        () => LoginLayout({ children: 'login' }),
        () => RegisterLayout({ children: 'register' }),
      ]) {
        await expect(renderPage()).rejects.toThrow('redirect');
        expect(auth.redirect).toHaveBeenLastCalledWith('/dashboard');
      }
    },
  );
  test('keeps guest forms reachable', async () => {
    expect(await LoginLayout({ children: 'login' })).toBe('login');
    expect(await RegisterLayout({ children: 'register' })).toBe('register');
    expect(auth.redirect).not.toHaveBeenCalled();
  });
});
