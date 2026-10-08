import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AdminLoadError } from './admin-load-error';

afterEach(cleanup);

test('an unreachable API says so and offers a retry', () => {
  const onRetry = vi.fn();
  render(<AdminLoadError error={{ kind: 'unreachable', message: 'โหลดไม่ได้' }} onRetry={onRetry} />);

  expect(screen.getByRole('alert')).toHaveTextContent('เชื่อมต่อ API ไม่สำเร็จ');
  expect(screen.getByRole('alert')).toHaveTextContent('โหลดไม่ได้');
  fireEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  expect(onRetry).toHaveBeenCalledOnce();
});

test('a broken API is told apart from an unreachable one', () => {
  render(<AdminLoadError error={{ kind: 'broken', message: 'boom' }} onRetry={() => {}} />);

  expect(screen.getByRole('alert')).toHaveTextContent('โหลดข้อมูลไม่สำเร็จ');
  expect(screen.getByRole('alert')).toHaveTextContent('boom');
});

test('an ended session links to sign-in instead of retrying', () => {
  render(
    <AdminLoadError
      error={{ kind: 'sessionEnded', message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง' }}
      onRetry={() => {}}
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('เซสชันหมดอายุ');
  expect(screen.getByRole('link', { name: 'เข้าสู่ระบบอีกครั้ง' })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).not.toBeInTheDocument();
});
