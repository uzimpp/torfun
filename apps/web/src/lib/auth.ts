import { cookies } from 'next/headers';

import { api_url } from './config';

export async function get_current_user() {
  try {
    const cookie_store = await cookies();
    const token = cookie_store.get('torfun_token');

    if (!token) {
      return null;
    }

    const response = await fetch(`${api_url}/api/auth/me`, {
      headers: {
        Cookie: `torfun_token=${token.value}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}
