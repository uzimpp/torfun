import { FileSearch, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { requireCompany } from '@/lib/auth';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
export default async function DashboardPage() {
  // `requireCompany`, not `requireUser`: an officer with no Company is sent to
  // the page that records one, because everything here compares tenders against
  // a record they do not have yet. Administrators are exempt and stay null.
  const user = await requireCompany();
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-10">
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
        {user.role === 'admin' && (
          <Link
            href="/admin/ingestion"
            className={cn(buttonVariants({ variant: 'outline' }), 'mt-6 min-h-12 px-5')}
          >
            ติดตามการดึงข้อมูล TOR <ArrowUpRight aria-hidden="true" />
          </Link>
        )}
      </section>
    </main>
  );
}
