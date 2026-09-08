import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { NavLinks } from './nav-links';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
afterEach(cleanup);
test('sidebar shows active destination and marks future routes without dead links', () => {
  const onNavigate = vi.fn();
  render(<NavLinks role="admin" onNavigate={onNavigate} />);
  const link = screen.getByRole('link', { name: 'แดชบอร์ด' });
  expect(link).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'การดึงข้อมูล TOR' })).not.toHaveAttribute(
    'aria-current',
  );
  expect(screen.queryByRole('link', { name: /ค้นหา TOR/ })).not.toBeInTheDocument();
  expect(screen.getByText('ค้นหา TOR').parentElement).toHaveAttribute('aria-disabled', 'true');
  link.addEventListener('click', (event) => event.preventDefault(), { once: true });
  fireEvent.click(link);
  expect(onNavigate).toHaveBeenCalledOnce();
});
test('BD does not see admin ingestion navigation', () => {
  render(<NavLinks role="business_development_officer" />);
  expect(screen.queryByRole('link', { name: 'การดึงข้อมูล TOR' })).not.toBeInTheDocument();
});
