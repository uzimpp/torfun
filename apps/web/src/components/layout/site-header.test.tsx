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
  // Notifications are not built; a permanently disabled bell was furniture.
  expect(screen.queryByRole('button', { name: /การแจ้งเตือน/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /เปลี่ยนภาษา/ })).not.toBeInTheDocument();
  // The light/dark control belongs to the footer now; the header keeps only
  // what a person reaches for on every visit.
  expect(screen.queryByRole('button', { name: /สลับโหมด/ })).not.toBeInTheDocument();
});

test.each(['admin', 'business_development_officer'] as const)(
  '%s has a user popup with dashboard and logout',
  async (role) => {
    render(<SiteHeader user={{ username: 'tester', role }} />);
    expect(screen.getByRole('link', { name: 'Torfun' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'เข้าสู่ระบบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: `บัญชี tester · ${role === 'admin' ? 'Admin' : 'BD'}` }),
    );
    expect(await screen.findByRole('menuitem', { name: 'ออกจากระบบ' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'แดชบอร์ด' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  },
);

test('the officer menu is the workspace and the company record', async () => {
  render(<SiteHeader user={{ username: 'tester', role: 'business_development_officer' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'บัญชี tester · BD' }));
  await screen.findByRole('menuitem', { name: 'ออกจากระบบ' });

  // `/company` is the page for changing the record later; the longer path
  // stays reserved for the guided version inside registration.
  expect(screen.getByRole('menuitem', { name: 'บริษัทและผลงาน' })).toHaveAttribute(
    'href',
    '/company',
  );
  expect(screen.getByRole('menuitem', { name: /TOR ของฉัน/ })).toHaveAttribute(
    'data-disabled',
    '',
  );
  // An officer has no reason to see the administrator's console.
  expect(screen.queryByRole('menuitem', { name: 'จัดการบัญชีผู้ใช้' })).not.toBeInTheDocument();
});

test('the administrator menu is the console, its failure log, and the accounts', async () => {
  render(<SiteHeader user={{ username: 'tester', role: 'admin' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'บัญชี tester · Admin' }));
  await screen.findByRole('menuitem', { name: 'ออกจากระบบ' });

  expect(screen.getByRole('menuitem', { name: 'การดึงข้อมูล TOR' })).toHaveAttribute(
    'href',
    '/admin/ingestion',
  );
  expect(screen.getByRole('menuitem', { name: 'บันทึกข้อผิดพลาด' })).toHaveAttribute(
    'href',
    '/admin/ingestion#failures',
  );
  expect(screen.getByRole('menuitem', { name: 'จัดการบัญชีผู้ใช้' })).toHaveAttribute(
    'href',
    '/admin/accounts',
  );
  // An administrator holds no Company (ADR-0011), so the row is not offered.
  expect(screen.queryByRole('menuitem', { name: 'บริษัทและผลงาน' })).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /TOR ของฉัน/ })).not.toBeInTheDocument();
});

test('the header carries a search field away from the pages that own one', () => {
  render(<SiteHeader user={{ username: 'tester', role: 'business_development_officer' }} />);
  expect(screen.getByRole('search', { name: 'ค้นหาประกาศ TOR' })).toHaveAttribute(
    'action',
    '/search',
  );
  expect(screen.getByRole('searchbox', { name: 'ค้นหาประกาศ TOR' })).toHaveAttribute('name', 'q');
});
