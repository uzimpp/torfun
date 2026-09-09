import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Home from './page';
import LoginLayout from '../login/layout';
import RegisterLayout from '../register/layout';
const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
}));
vi.mock('@/lib/auth', () => ({ getCurrentUser: auth.getCurrentUser }));
vi.mock('next/navigation', () => ({
  redirect: auth.redirect,
  // The hero's search field is a client component and reaches for the router.
  useRouter: () => ({ push: vi.fn() }),
}));
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
    expect(screen.getAllByRole('link', { name: /สร้างบัญชีผู้ใช้/ })[0]).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByText(/ผลสรุปจาก AI เป็นข้อมูลช่วยอ่าน/)).toBeInTheDocument();
    // Typing a query and pressing enter must reach the results page even
    // before hydration, so the field has to be a real GET form.
    const search = screen.getByRole('search', { name: 'ค้นหาประกาศ TOR' });
    expect(search).toHaveAttribute('action', '/search');
    expect(search).toHaveAttribute('method', 'get');
  });
  test.each(['admin', 'business_development_officer'])(
    'redirects %s away from the auth forms, but never from the landing page',
    async (role) => {
      auth.getCurrentUser.mockResolvedValue({ username: 'test-user', role });
      for (const renderPage of [
        () => LoginLayout({ children: 'login' }),
        () => RegisterLayout({ children: 'register' }),
      ]) {
        await expect(renderPage()).rejects.toThrow('redirect');
        expect(auth.redirect).toHaveBeenLastCalledWith('/dashboard');
      }
    },
  );
  test.each(['admin', 'business_development_officer'])(
    'renders the landing page for a signed-in %s, pointing them at their workspace',
    async (role) => {
      auth.getCurrentUser.mockResolvedValue({ username: 'test-user', role });
      render(await Home());

      // The whole point: following a link to the marketing page must not bounce
      // an officer into the sign-up flow, which is what the old redirect did by
      // way of the dashboard's company gate.
      expect(auth.redirect).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ค้นหาโอกาสจาก TOR');
      expect(screen.getAllByRole('link', { name: /ไปที่แดชบอร์ด/ })[0]).toHaveAttribute(
        'href',
        '/dashboard',
      );
      expect(screen.queryByRole('link', { name: 'สร้างบัญชีผู้ใช้' })).not.toBeInTheDocument();
      // Search is the one thing the hero offers to everyone: signing in does
      // not take it away, it only changes what sits underneath it.
      expect(screen.getByRole('searchbox', { name: 'ค้นหาประกาศ TOR' })).toBeInTheDocument();
    },
  );
  test('keeps guest forms reachable', async () => {
    expect(await LoginLayout({ children: 'login' })).toBe('login');
    expect(await RegisterLayout({ children: 'register' })).toBe('register');
    expect(auth.redirect).not.toHaveBeenCalled();
  });
});
