'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api_url } from '@/lib/config';

export default function RegisterPage() {
  const router = useRouter();

  const [username, set_username] = useState('');
  const [password, set_password] = useState('');
  const [confirm_password, set_confirm_password] = useState('');
  const [company_name, set_company_name] = useState('');

  const [error, set_error] = useState('');
  const [loading, set_loading] = useState(false);

  async function handle_submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    set_error('');

    if (password !== confirm_password) {
      set_error('Passwords do not match');
      return;
    }

    set_loading(true);

    try {
      const response = await fetch(`${api_url}/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          confirm_password,
          company_name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        set_error(data.message ?? 'Registration failed');
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
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create your account</h1>

          <p className="mt-2 text-sm text-gray-500">
            Join Torfun to discover relevant procurement opportunities
          </p>
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
              minLength={3}
              maxLength={50}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="Choose a username"
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
              minLength={8}
              maxLength={128}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="Create a password"
            />

            <p className="mt-1 text-xs text-gray-400">Must be at least 8 characters</p>
          </div>

          <div>
            <label
              htmlFor="confirm_password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Confirm Password
            </label>

            <input
              id="confirm_password"
              type="password"
              value={confirm_password}
              onChange={(event) => set_confirm_password(event.target.value)}
              required
              minLength={8}
              maxLength={128}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="Confirm your password"
            />
          </div>

          <div>
            <label htmlFor="company_name" className="mb-2 block text-sm font-medium text-gray-700">
              Company / Business Name
            </label>

            <input
              id="company_name"
              type="text"
              value={company_name}
              onChange={(event) => set_company_name(event.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 transition outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
              placeholder="Enter your company name"
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-gray-900 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </main>
  );
}
