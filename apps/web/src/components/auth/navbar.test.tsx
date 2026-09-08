import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Navbar } from './navbar';
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
afterEach(cleanup);
test('guest header contains brand and login without workspace links', () => {
  render(<Navbar user={null} />);
  expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Torfun' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('link', { name: 'แดชบอร์ด' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /การแจ้งเตือน/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /เปลี่ยนภาษา/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /สลับโหมด/ })).toBeDisabled();
});
test.each(['admin', 'business_development_officer'] as const)(
  '%s has a user popup with logout',
  async (role) => {
    render(<Navbar user={{ username: 'tester', role }} />);
    expect(screen.getByRole('link', { name: 'Torfun' })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'เข้าสู่ระบบ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /การแจ้งเตือน/ })).toBeDisabled();
    expect(screen.queryByRole('menuitem', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: `บัญชี tester · ${role === 'admin' ? 'Admin' : 'BD'}` }),
    );
    expect(await screen.findByRole('menuitem', { name: 'ออกจากระบบ' })).toBeInTheDocument();
  },
);
