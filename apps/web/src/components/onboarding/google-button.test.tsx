import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { GoogleButton } from './google-button';

afterEach(cleanup);

/**
 * The wording is the point. The same endpoint signs a returning officer in and
 * creates an account for a new one, so each page has to say which it is about
 * to do rather than both claiming "sign in".
 */

test('the sign-up page offers to create an account, not to sign in', () => {
  render(<GoogleButton intent="signup" />);
  expect(screen.getByRole('button')).toHaveAccessibleName('สมัครด้วยบัญชี Google');
});

test('the sign-in page offers to sign in', () => {
  render(<GoogleButton intent="signin" />);
  expect(screen.getByRole('button')).toHaveAccessibleName('เข้าสู่ระบบด้วย Google');
});

test('both send the browser to the same endpoint', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { assign });
  const { rerender } = render(<GoogleButton intent="signup" />);
  screen.getByRole('button').click();
  rerender(<GoogleButton intent="signin" />);
  screen.getByRole('button').click();

  expect(assign).toHaveBeenCalledTimes(2);
  expect(assign.mock.calls[0]![0]).toMatch(/\/api\/auth\/google$/);
  expect(assign.mock.calls[1]![0]).toBe(assign.mock.calls[0]![0]);
  vi.unstubAllGlobals();
});
