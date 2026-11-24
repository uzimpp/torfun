import { AdminDashboard } from '@/components/admin-dashboard/admin-dashboard';
import { OfficerDashboard } from '@/components/dashboard/officer-dashboard';
import { requireCompany } from '@/lib/auth';

export default async function DashboardPage() {
  // `requireCompany`, not `requireUser`: an officer with no Company is sent to
  // the page that records one, because everything here compares tenders against
  // a record they do not have yet. Administrators are exempt and stay null.
  const user = await requireCompany();

  // Administrators run the ingestion pipeline rather than search its output, so
  // the workspace they land on is the operations overview, not the officer's.
  if (user.role === 'admin') return <AdminDashboard />;

  return (
    <main className="page-fill mx-auto w-full max-w-6xl px-5 py-10 sm:px-10">
      <p className="text-primary text-sm font-medium">พื้นที่ทำงาน / แดชบอร์ด</p>
      <h1 className="mt-5 text-2xl font-medium">ยินดีต้อนรับ, {user.full_name}</h1>
      {user.company_name && (
        <p className="text-muted-foreground mt-3 break-words">{user.company_name}</p>
      )}
      <OfficerDashboard />
    </main>
  );
}
