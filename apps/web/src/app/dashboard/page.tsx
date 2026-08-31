import { redirect } from 'next/navigation';

import { Navbar } from '@/components/auth/navbar';
import { get_current_user } from '@/lib/auth';

export default async function DashboardPage() {
  const user = await get_current_user();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <Navbar username={user.username} />

      <div className="px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Procurement Intelligence Platform</p>

            <h1 className="mt-2 text-3xl font-bold text-gray-900">Dashboard</h1>

            <div className="mt-8 rounded-xl bg-gray-50 p-6">
              <p className="text-sm text-gray-500">Welcome back</p>

              <p className="mt-1 text-xl font-semibold text-gray-900">{user.username}</p>

              <p className="mt-2 text-sm text-gray-600">{user.company_name}</p>

              <p className="mt-1 text-xs text-gray-400">Role: {user.role}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
