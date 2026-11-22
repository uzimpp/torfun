import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
export default async function RegisterLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect('/dashboard');
  return children;
}
