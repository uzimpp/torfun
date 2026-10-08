import { FileSearch } from 'lucide-react';
import { AdminDashboard } from '@/components/admin-dashboard/admin-dashboard';
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
      <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">ยินดีต้อนรับ, {user.full_name}</h1>
      {user.company_name && (
        <p className="text-muted-foreground mt-3 break-words">{user.company_name}</p>
      )}
      <section
        aria-labelledby="workspace-heading"
        className="bg-card mt-10 rounded-3xl border p-6 sm:p-10"
      >
        <FileSearch className="text-primary mb-6 size-10" aria-hidden="true" />
        <h2 id="workspace-heading" className="text-2xl font-semibold">
          พื้นที่สำหรับโอกาสถัดไปของทีม
        </h2>
        <p className="text-muted-foreground mt-4 max-w-xl leading-relaxed">
          เริ่มต้นจากเมนูด้านข้างเพื่อใช้งานส่วนที่พร้อมให้บริการ การค้นหา TOR และ TOR
          ของฉันกำลังอยู่ระหว่างการพัฒนา
        </p>
      </section>
    </main>
  );
}
