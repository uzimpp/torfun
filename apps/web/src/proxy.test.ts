// @vitest-environment node
import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ACCESS_COOKIE } from '@torfun/types';
import { AUTH_RETURN_COOKIE } from './lib/auth-return';
import { proxy } from './proxy';
vi.mock('./lib/session', () => ({ renewSession: vi.fn() }));
test('Google dashboard callback resumes one allowed path and consumes its navigation cookie', async () => {
  const path = '/notifications/link-line?link_token=platform-token';
  const request = new NextRequest('http://localhost:3000/dashboard', {
    headers: {
      cookie: `${ACCESS_COOKIE}=session; ${AUTH_RETURN_COOKIE}=${encodeURIComponent(path)}`,
    },
  });
  const response = await proxy(request);
  expect(response.headers.get('location')).toBe(`http://localhost:3000${path}`);
  expect(response.cookies.get(AUTH_RETURN_COOKIE)?.value).toBe('');
});
test('an untrusted navigation cookie cannot cause an external redirect', async () => {
  const request = new NextRequest('http://localhost:3000/dashboard', {
    headers: {
      cookie: `${ACCESS_COOKIE}=session; ${AUTH_RETURN_COOKIE}=${encodeURIComponent('https://attacker.test')}`,
    },
  });
  const response = await proxy(request);
  expect(response.headers.get('location')).toBeNull();
});
