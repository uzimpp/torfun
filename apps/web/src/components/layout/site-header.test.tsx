import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SiteHeader } from './site-header';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
afterEach(cleanup);

test('guest header contains brand and both ways in, without workspace links', () => {
  render(<SiteHeader user={null} />);
  expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'สร้างบัญชีผู้ใช้' })).toHaveAttribute(
    'href',
    '/register',
  );
  expect(screen.getByRole('link', { name: 'Torfun' })).toHaveAttribute('href', '/');
  expect(screen.queryByRole('link', { name: 'แดชบอร์ด' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /การแจ้งเตือน/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /เปลี่ยนภาษา/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /สลับโหมด/ })).toBeEnabled();
});

test.each(['admin', 'business_development_officer'] as const)(
  '%s has a user popup with logout',
  async (role) => {
    render(<SiteHeader user={{ username: 'tester', role }} />);
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

test('the header carries a search field away from the pages that own one', () => {
  render(<SiteHeader user={{ username: 'tester', role: 'business_development_officer' }} />);
  expect(screen.getByRole('search', { name: 'ค้นหาประกาศ TOR' })).toHaveAttribute(
    'action',
    '/search',
  );
  expect(screen.getByRole('searchbox', { name: 'ค้นหาประกาศ TOR' })).toHaveAttribute('name', 'q');
});
