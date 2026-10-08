import type { Metadata } from 'next';
import { IngestionDashboard } from '@/components/ingestion/ingestion-dashboard';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'ระบบดึงข้อมูล | TOR Finder',
  description: 'หน้าสำหรับผู้ดูแลระบบ ควบคุมและติดตามการดึงประกาศ TOR จากระบบ e-GP',
};

export default async function IngestionPage() {
  // The API enforces this too; the check here is so a non-admin gets a redirect
  // instead of a console that renders and then fills with 403s.
  await requireAdmin();

  return <IngestionDashboard />;
}
