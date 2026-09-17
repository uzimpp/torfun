import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LogoutButton } from './logout-button';
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test('posts credentials, prevents duplicate clicks, and refreshes after success', async () => {
  let resolve!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
  });
  resolve(new Response('{}', { status: 200 }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/login'));
  expect(router.refresh).toHaveBeenCalledOnce();
});
test.each(['http', 'network'])('shows %s failures without redirecting', async (failure) => {
  vi.stubGlobal(
    'fetch',
    failure === 'http'
      ? vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
      : vi.fn().mockRejectedValue(new TypeError('offline')),
  );
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    failure === 'http' ? 'ออกจากระบบไม่สำเร็จ' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้',
  );
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByRole('button')).toBeEnabled();
});
