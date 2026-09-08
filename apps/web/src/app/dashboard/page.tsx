import { Navbar } from '@/components/auth/navbar';
import { requireUser } from '@/lib/auth';

/** USR-10 role names are storage values; these are what a person should read. */
const ROLE_LABELS = {
  admin: 'Administrator',
  business_development_officer: 'Business Development Officer',
} as const;

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="min-h-screen bg-gray-50">
      <Navbar name={user.full_name} />

      <div className="px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Procurement Intelligence Platform</p>

            <h1 className="mt-2 text-3xl font-bold text-gray-900">Dashboard</h1>

            <div className="mt-8 rounded-xl bg-gray-50 p-6">
              <p className="text-sm text-gray-500">Welcome back</p>

              <p className="mt-1 text-xl font-semibold text-gray-900">{user.full_name}</p>

              <p className="mt-1 text-sm text-gray-500">@{user.username}</p>

              <p className="mt-2 text-sm text-gray-600">{user.company_name}</p>

              <p className="mt-1 text-xs text-gray-400">Role: {ROLE_LABELS[user.role]}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
