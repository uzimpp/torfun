import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { WorkspaceNav } from './workspace-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
afterEach(cleanup);

test('sidebar shows active destination and admin gets ingestion, not favorited', () => {
  const onNavigate = vi.fn();
  render(<WorkspaceNav role="admin" onNavigate={onNavigate} />);
  const link = screen.getByRole('link', { name: 'แดชบอร์ด' });
  expect(link).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'ค้นหา TOR' })).toHaveAttribute('href', '/search');
  expect(screen.getByRole('link', { name: 'การดึงข้อมูล TOR' })).not.toHaveAttribute(
    'aria-current',
  );
  // Admins never bid, so they have nothing to favorite.
  expect(screen.queryByRole('link', { name: /TOR ที่บันทึกไว้/ })).not.toBeInTheDocument();
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(onNavigate).toHaveBeenCalledOnce();
});

test('BD sees favorited TORs and search, not the admin ingestion console', () => {
  render(<WorkspaceNav role="business_development_officer" />);
  expect(screen.queryByRole('link', { name: 'การดึงข้อมูล TOR' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ค้นหา TOR' })).toHaveAttribute('href', '/search');
  expect(screen.getByRole('link', { name: 'TOR ที่บันทึกไว้' })).toHaveAttribute(
    'href',
    '/favorited',
  );
});
