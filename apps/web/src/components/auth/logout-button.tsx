'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api_url } from '@/lib/config';

export function LogoutButton() {
  const router = useRouter();
  const [loading, set_loading] = useState(false);

  async function handle_logout() {
    set_loading(true);

    try {
      const response = await fetch(`${api_url}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        router.push('/login');
        router.refresh();
      }
    } finally {
      set_loading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle_logout}
      disabled={loading}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? 'Signing out...' : 'Logout'}
    </button>
  );
}
