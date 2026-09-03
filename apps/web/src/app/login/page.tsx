'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api_url } from '@/lib/config';

export default function LoginPage() {
  const router = useRouter();

  const [username, set_username] = useState('');
  const [password, set_password] = useState('');
  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(false);

  async function handle_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    set_error('');
    set_loading(true);

    try {
      const response = await fetch(`${api_url}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        set_error(data.message ?? 'Login failed');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      set_error('Unable to connect to the server');
    } finally {
      set_loading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Torfun</h1>

          <p className="mt-2 text-sm text-gray-500">Procurement Intelligence Platform</p>
        </div>

        <form onSubmit={handle_submit} className="space-y-5">
          <div>
            <label htmlFor="username" className="mb-2 block text-sm font-medium text-gray-700">
              Username
            </label>

            <input
              id="username"
              type="text"
              value={username}
              onChange={(event) => set_username(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => set_password(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-sm text-gray-400">or</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.assign(new URL('/api/auth/google', api_url).toString());
          }}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 transition hover:bg-gray-50"
        >
          Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <a href="/register" className="font-medium text-gray-900 hover:underline">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}
