import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { WorkspaceNav } from './workspace-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
afterEach(cleanup);

test('sidebar shows active destination and marks future routes without dead links', () => {
  const onNavigate = vi.fn();
  render(<WorkspaceNav role="admin" onNavigate={onNavigate} />);
  const link = screen.getByRole('link', { name: 'แดชบอร์ด' });
  expect(link).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'ค้นหา TOR' })).toHaveAttribute('href', '/search');
  expect(screen.getByRole('link', { name: 'การดึงข้อมูล TOR' })).not.toHaveAttribute(
    'aria-current',
  );
  expect(screen.queryByRole('link', { name: /TOR ของฉัน/ })).not.toBeInTheDocument();
  expect(screen.getByText('TOR ของฉัน').parentElement).toHaveAttribute('aria-disabled', 'true');
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(onNavigate).toHaveBeenCalledOnce();
});

test('BD does not see admin ingestion navigation but does see search', () => {
  render(<WorkspaceNav role="business_development_officer" />);
  expect(screen.queryByRole('link', { name: 'การดึงข้อมูล TOR' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ค้นหา TOR' })).toHaveAttribute('href', '/search');
});
